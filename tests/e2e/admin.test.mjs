/**
 * End-to-end test of the browser admin against a fake GitHub API.
 *
 * Guards the bugs the previous admin had: Korean text decoded with atob()
 * (mojibake that was then committed back), `verified` never written (so a
 * published post broke the deploy), and unknown frontmatter such as
 * `image` silently dropped on save. Also checks that the CSP holds and that
 * a hostile post body can't run script in the preview.
 *
 *   DIST_DIR=dist node --test tests/e2e/admin.test.mjs
 */
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { after, before, beforeEach, describe, it } from "node:test";
import { AxeBuilder } from "@axe-core/playwright";
import { launchBrowser, serveDist } from "./helpers.mjs";

const DIST = process.env.DIST_DIR ?? "dist";
const DIR = "src/content/blog";

const KOREAN_POST = `---
title: "'유레카' 순간의 진실"
description: "발견은 번개처럼 오기보다 천천히 쌓인다는 이야기."
pubDate: 2026-04-15T18:00:00+09:00
tags: ["연구", "에세이"]
draft: true
verified: false
featured: false
math: false
image: {"url": "/blog/images/cover.png", "alt": "표지 그림"}
series: "발견 시리즈"
---

영화 속 과학자는 갑자기 "유레카!"를 외친다.

## 현실의 발견
`;

/** A valid RGBA PNG of the given size (a gradient, so it doesn't compress to nothing). */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x++) {
      row[1 + x * 4] = (x * 255) / width;
      row[2 + x * 4] = (y * 255) / height;
      row[3 + x * 4] = 128;
      row[4 + x * 4] = 255;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Width and height from a lossy (VP8) or lossless (VP8L) WebP header. */
function webpSize(buf) {
  assert.equal(buf.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buf.subarray(8, 12).toString("ascii"), "WEBP");
  const format = buf.subarray(12, 16).toString("ascii");
  if (format === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (format === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  throw new Error(`unknown WebP format ${format}`);
}

/** In-memory GitHub: path -> { text, sha }. */
let repo;
let commits;
let shaCounter;

function graphql(body) {
  const { query, variables } = body;
  if (query.includes("viewerPermission")) {
    return { data: { viewer: { login: "tester" }, repository: { viewerPermission: "WRITE" } } };
  }
  const expr = variables.expr.replace(/^main:/, "");
  if (query.includes("entries")) {
    const entries = [...repo.entries()]
      .filter(([p]) => p.startsWith(`${expr}/`))
      .map(([p, f]) => ({ name: p.split("/").pop(), path: p, oid: f.sha, type: "blob", object: { text: f.text, isTruncated: false } }));
    return { data: { repository: { object: { entries } } } };
  }
  const file = repo.get(expr);
  return { data: { repository: { object: file ? { oid: file.sha, text: file.text } : null } } };
}

async function installFakeGitHub(page) {
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(request.headers()["authorization"], "Bearer test-token");
    if (url.pathname === "/graphql") {
      return route.fulfill({ json: graphql(request.postDataJSON()) });
    }
    const match = url.pathname.match(/^\/repos\/concrete-sangminlee\/blog\/contents\/(.+)$/);
    if (!match) return route.fulfill({ status: 404, json: { message: "Not Found" } });
    const path = decodeURIComponent(match[1]);
    const payload = request.postDataJSON();
    const existing = repo.get(path);
    if (request.method() === "PUT") {
      if (existing && payload.sha !== existing.sha) {
        return route.fulfill({ status: 409, json: { message: "sha mismatch" } });
      }
      if (!existing && payload.sha) return route.fulfill({ status: 422, json: { message: "sha given for new file" } });
      const bytes = Buffer.from(payload.content, "base64");
      const text = bytes.toString("utf8");
      const sha = `sha${++shaCounter}`;
      repo.set(path, { text, sha });
      commits.push({ method: "PUT", path, message: payload.message, text, bytes, branch: payload.branch });
      return route.fulfill({ json: { content: { sha }, commit: { html_url: "https://github.com/x/commit/1" } } });
    }
    if (request.method() === "DELETE") {
      if (!existing || payload.sha !== existing.sha) return route.fulfill({ status: 409, json: { message: "sha mismatch" } });
      repo.delete(path);
      commits.push({ method: "DELETE", path, message: payload.message });
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ status: 405, json: { message: "unexpected" } });
  });
}

async function openPost(page, index = 0) {
  await page.locator(".post-open").nth(index).click();
  await page.locator("#view-editor:not([hidden])").waitFor();
}

describe("admin", () => {
  let server;
  let browser;
  let page;
  let problems;

  before(async () => {
    server = await serveDist(DIST);
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  beforeEach(async () => {
    repo = new Map([[`${DIR}/eureka.mdx`, { text: KOREAN_POST, sha: "sha0" }]]);
    commits = [];
    shaCounter = 0;
    const context = await browser.newContext();
    page = await context.newPage();
    problems = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/cdn\.jsdelivr\.net|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(msg.text())) {
        problems.push(msg.text());
      }
    });
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("dialog", (dialog) => void dialog.accept(dialog.type() === "prompt" ? page.__promptAnswer ?? "" : undefined));
    // Fonts from the CDN are irrelevant here and may be unreachable in CI sandboxes.
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await installFakeGitHub(page);
    await page.goto(`${server.origin}/blog/admin/`);
    await page.fill("#token-input", "test-token");
    await page.click("#login-form button[type=submit]");
    await page.locator(".post-open").first().waitFor();
  });

  it("lists posts with their Korean titles intact", async () => {
    assert.equal(await page.locator(".post-name").first().textContent(), "'유레카' 순간의 진실");
    assert.match(await page.locator("#whoami").textContent(), /tester/);
    assert.deepEqual(problems, []);
  });

  it("loads Korean text without mojibake and saves it back byte-for-byte", async () => {
    await openPost(page);
    assert.equal(await page.inputValue("#ed-title"), "'유레카' 순간의 진실");
    assert.match(await page.inputValue("#ed-body"), /유레카!"를 외친다/);

    await page.fill("#ed-body", `${await page.inputValue("#ed-body")}\n\n추가한 문단.`);
    await page.click("#save-btn");
    await page.locator('#editor-status[data-tone="success"]').waitFor();

    assert.equal(commits.length, 1);
    const [commit] = commits;
    assert.equal(commit.path, `${DIR}/eureka.mdx`);
    assert.equal(commit.branch, "main");
    assert.match(commit.text, /^title: "'유레카' 순간의 진실"$/m);
    assert.match(commit.text, /^pubDate: 2026-04-15T18:00:00\+09:00$/m, "pubDate preserved exactly");
    assert.match(commit.text, /^verified: false$/m, "verified is always written");
    assert.match(commit.text, /^image: \{"url":"\/blog\/images\/cover.png","alt":"표지 그림"\}$/m, "image kept");
    assert.match(commit.text, /^series: "발견 시리즈"$/m, "unknown keys kept");
    assert.match(commit.text, /추가한 문단\.\n$/);
    assert.deepEqual(problems, []);
  });

  it("refuses to save a post that would fail the build, without committing", async () => {
    await openPost(page);
    await page.uncheck("#ed-draft");
    await page.fill("#ed-body", "짧은 본문 — 대시 포함");
    await page.click("#save-btn");
    await page.locator('#editor-status[data-tone="error"]').waitFor();
    const audit = await page.locator("#audit-list").textContent();
    assert.match(audit, /verified: true/);
    assert.match(audit, /em dash/);
    assert.equal(commits.length, 0);
  });

  it("creates a new draft at the slugged path with an offset pubDate", async () => {
    await page.click("#new-btn");
    await page.locator("#view-editor:not([hidden])").waitFor();
    await page.fill("#ed-title", "새 글: 구조 해석 101");
    assert.equal(await page.inputValue("#ed-slug"), "새-글-구조-해석-101");
    await page.fill("#ed-desc", "자동으로 만들어진 슬러그와 날짜를 확인하는 글입니다.");
    await page.fill("#ed-tags", "구조공학, 테스트");
    await page.fill("#ed-body", "초안 본문입니다.");
    await page.keyboard.press("Control+s");
    await page.locator('#editor-status[data-tone="success"]').waitFor();

    const [commit] = commits;
    assert.equal(commit.path, `${DIR}/새-글-구조-해석-101.mdx`);
    assert.equal(commit.message, "New post: 새 글: 구조 해석 101");
    assert.match(commit.text, /^pubDate: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/m);
    assert.match(commit.text, /^tags: \["구조공학","테스트"\]$/m);
    assert.match(commit.text, /^draft: true$/m);
    assert.match(commit.text, /^verified: false$/m);
  });

  it("blocks a new post whose slug already exists", async () => {
    await page.click("#new-btn");
    await page.locator("#view-editor:not([hidden])").waitFor();
    await page.fill("#ed-title", "Eureka");
    await page.fill("#ed-slug", "eureka");
    assert.match(await page.locator("#audit-list").textContent(), /같은 주소의 글이 이미 있습니다/);
  });

  it("reports a conflict instead of overwriting someone else's change", async () => {
    await openPost(page);
    repo.set(`${DIR}/eureka.mdx`, { text: KOREAN_POST.replace("천천히", "느리게"), sha: "sha-other" });
    await page.fill("#ed-desc", "다른 곳에서 동시에 고친 경우를 확인하는 설명입니다.");
    await page.click("#save-btn");
    await page.locator('#editor-status[data-tone="error"]').waitFor();
    assert.match(await page.locator("#editor-status").textContent(), /자동 저장/);
    assert.equal(repo.get(`${DIR}/eureka.mdx`).sha, "sha-other");
  });

  it("deletes only after the title is typed back", async () => {
    await openPost(page);
    page.__promptAnswer = "틀린 제목";
    await page.click("#delete-btn");
    assert.equal(commits.length, 0);
    page.__promptAnswer = "'유레카' 순간의 진실";
    await page.click("#delete-btn");
    await page.locator(".empty").waitFor();
    assert.deepEqual(commits.map((c) => c.method), ["DELETE"]);
  });

  it("previews in a sandbox where post HTML cannot run script", async () => {
    await openPost(page);
    await page.fill("#ed-body", '## 미리보기\n\n<img src="x" onerror="parent.document.title=\'pwned\'">\n\n<script>parent.document.title="pwned"</script>');
    await page.click("#preview-btn");
    const frame = page.frameLocator("#preview-frame");
    await frame.locator("h2").waitFor();
    assert.equal(await frame.locator("h2").textContent(), "미리보기");
    await page.waitForTimeout(300);
    assert.notEqual(await page.title(), "pwned");
  });

  it("has no accessibility violations in the list and editor views", async () => {
    const scan = async () =>
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map(
        (v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`,
      );
    assert.deepEqual(await scan(), [], "list view");
    await openPost(page);
    assert.deepEqual(await scan(), [], "editor view");
  });

  it("resizes an uploaded image to WebP and commits it before the post", async () => {
    await openPost(page);
    await page.locator("#ed-body").evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
    await page.setInputFiles("#image-input", { name: "단면 Photo.png", mimeType: "image/png", buffer: makePng(2400, 1200) });
    await page.locator('#editor-status[data-tone="success"]').waitFor();

    const body = await page.inputValue("#ed-body");
    const match = body.match(/!\[\]\((\/blog\/images\/eureka\/photo-[0-9a-f]{8}\.webp)\)/);
    assert.ok(match, `image markdown inserted: ${body.slice(-120)}`);
    const url = match[1];
    assert.match(await page.locator("#audit-list").textContent(), /no alt text/, "missing alt blocks saving");
    assert.match(await page.locator("#pending-images").textContent(), /1개/);

    // Caret sits inside the brackets: typing fills the alt text.
    await page.keyboard.type("단면 사진");
    assert.ok((await page.inputValue("#ed-body")).includes(`![단면 사진](${url})`));

    await page.click("#save-btn");
    await page.locator('#editor-status[data-tone="success"]').waitFor();
    assert.deepEqual(commits.map((c) => c.path), [`public${url.replace("/blog", "")}`, `${DIR}/eureka.mdx`]);
    const size = webpSize(commits[0].bytes);
    assert.deepEqual(size, { width: 1600, height: 800 }, "downscaled to 1600px, aspect kept");
    assert.ok(commits[0].bytes.length < 200_000, `WebP is small (${commits[0].bytes.length} bytes)`);
    assert.equal(await page.locator("#pending-images").textContent(), "");
  });

  it("rejects SVG uploads (they could run script on this origin)", async () => {
    await openPost(page);
    const before = await page.inputValue("#ed-body");
    await page.setInputFiles("#image-input", {
      name: "diagram.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    await page.locator('#editor-status[data-tone="error"]').waitFor();
    assert.match(await page.locator("#editor-status").textContent(), /SVG/);
    assert.equal(await page.inputValue("#ed-body"), before);
  });

  it("wraps the selection with ⌘/Ctrl+B and ⌘/Ctrl+K", async () => {
    await openPost(page);
    await page.fill("#ed-body", "강조할 단어");
    await page.locator("#ed-body").evaluate((el) => el.setSelectionRange(0, 3));
    await page.keyboard.press("Control+b");
    assert.equal(await page.inputValue("#ed-body"), "**강조할** 단어");
    await page.locator("#ed-body").evaluate((el) => el.setSelectionRange(el.value.length - 2, el.value.length));
    await page.keyboard.press("Control+k");
    assert.equal(await page.inputValue("#ed-body"), "**강조할** [단어](https://)");
    // Ctrl+Z undoes the formatting like any other edit.
    await page.keyboard.press("Control+z");
    assert.equal(await page.inputValue("#ed-body"), "**강조할** 단어");
  });

  it("renders math and pending images in the preview", async () => {
    await openPost(page);
    await page.fill("#ed-body", "## 수식\n\n응력 $\\sigma = E\\varepsilon$\n\n$$\nx^2\n$$\n");
    await page.locator("#ed-body").evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
    await page.setInputFiles("#image-input", { name: "small.png", mimeType: "image/png", buffer: makePng(40, 20) });
    await page.locator('#editor-status[data-tone="success"]').waitFor();
    await page.click("#preview-btn");
    const frame = page.frameLocator("#preview-frame");
    await frame.locator(".katex").first().waitFor();
    assert.equal(await frame.locator(".katex-display").count(), 1);
    assert.match(await frame.locator("img").first().getAttribute("src"), /^data:image\/(webp|png);base64,/);
    assert.deepEqual(problems, []);
  });

  it("keeps the token out of persistent storage unless asked", async () => {
    const stored = await page.evaluate(() => [sessionStorage.getItem("blog-admin:token"), localStorage.getItem("blog-admin:token")]);
    assert.deepEqual(stored, ["test-token", null]);
  });
});
