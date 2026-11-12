/**
 * Behavioural checks on the fixture build (tests/fixtures/blog), which
 * exercises every feature the real blog may use: math, code, tables,
 * footnotes, MDX components, drafts, ignored partials, related posts.
 *
 *   npm run build:fixture && node --test tests/e2e/site.test.mjs
 */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { AxeBuilder } from "@axe-core/playwright";
import { launchBrowser, serveDist } from "./helpers.mjs";

const DIST = path.resolve(process.env.DIST_DIR ?? "dist-fixture");
const read = (rel) => readFile(path.join(DIST, rel), "utf8");
const exists = (rel) => stat(path.join(DIST, rel)).then(() => true, () => false);
const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1])["@graph"]);

describe("fixture build output", () => {
  it("publishes posts, but never drafts or _partials", async () => {
    assert.ok(await exists("structural-analysis-notes/index.html"));
    assert.ok(await exists("plain-markdown-post/index.html"), ".md files are part of the collection");
    assert.ok(!(await exists("draft-in-progress/index.html")));
    assert.ok(!(await exists("og/draft-in-progress.png")));
    assert.ok(!(await exists("partial-notes/index.html")));
    assert.doesNotMatch(await read("sitemap-0.xml"), /draft-in-progress|partial|admin|404/);
  });

  it("renders math with self-hosted KaTeX CSS only where needed", async () => {
    const mathPage = await read("structural-analysis-notes/index.html");
    assert.match(mathPage, /class="katex"/);
    assert.match(mathPage, /<link rel="stylesheet" href="\/blog\/_astro\/katex[^"]*\.css">/);
    assert.doesNotMatch(mathPage, /cdn\.jsdelivr\.net\/npm\/katex/);
    assert.doesNotMatch(await read("plain-markdown-post/index.html"), /katex[^"]*\.css/);
  });

  it("adds section permalinks, wraps tables and localises footnotes", async () => {
    const html = await read("structural-analysis-notes/index.html");
    assert.match(html, /<h2 id="결과-비교">결과 비교<a class="heading-anchor" href="#결과-비교" aria-label="‘결과 비교’ 섹션 링크">/);
    assert.match(html, /<div class="table-scroll" tabindex="0" role="region"/);
    assert.match(html, /id="footnote-label">각주<\/h2>/, "footnote heading has no permalink");
    assert.doesNotMatch(html, /data-toc-slug="footnote-label"/, "footnotes are not a TOC section");
    assert.match(html, /<div class="callout callout-warning" role="note" aria-label="단위 주의"/);
    assert.match(html, /<figcaption>그림 1\./);
  });

  it("collects heading ids and TOC text before KaTeX renders them", async () => {
    const html = await read("column-buckling-notes/index.html");
    // "### $K$ 값이 뜻하는 것": TeX source, not KaTeX's three copies ("KKK").
    assert.match(html, /<h3 id="k-값이-뜻하는-것">/);
    assert.match(html, /data-toc-slug="k-값이-뜻하는-것"[^>]*>\s*K 값이 뜻하는 것\s*</);
    assert.match(html, /aria-label="‘K 값이 뜻하는 것’ 섹션 링크"/);
    assert.doesNotMatch(html, /KKK/);
  });

  it("loads KaTeX CSS when remark-math parsed math, even without math: true", async () => {
    // plain-markdown-post has math: false and no math; the others do.
    assert.match(await read("column-buckling-notes/index.html"), /katex[^"]*\.css/);
    assert.doesNotMatch(await read("plain-markdown-post/index.html"), /katex[^"]*\.css/);
  });

  it("shows dates in Korea time even when built in UTC", async () => {
    // pubDate 2026-01-20T08:00+09:00 is still January 19th in UTC.
    assert.match(await read("plain-markdown-post/index.html"), /2026년 1월 20일/);
  });

  it("emits complete article metadata", async () => {
    const html = await read("structural-analysis-notes/index.html");
    assert.match(html, /<meta property="og:locale" content="ko_KR">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/concrete-sangminlee\.github\.io\/blog\/og\/structural-analysis-notes\.png">/);
    assert.match(html, /<meta property="og:image:type" content="image\/png">/);
    const graph = jsonLd(html);
    const article = graph.find((node) => node["@type"] === "BlogPosting");
    assert.equal(article.headline, "단순보 처짐 계산을 코드로 검증하기");
    assert.equal(article.datePublished, "2026-03-02T00:30:00.000Z");
    assert.equal(article.dateModified, "2026-03-10T12:00:00.000Z");
    assert.deepEqual(article.keywords, ["구조공학", "수치해석"]);
    assert.match(article.timeRequired, /^PT\d+M$/);
    assert.ok(graph.some((node) => node["@type"] === "BreadcrumbList"));
  });

  it("links related posts by shared tags and prev/next by date", async () => {
    // Newest first: structural (Mar) > attention (Feb) > plain (Jan) > column (Dec).
    const structural = await read("structural-analysis-notes/index.html");
    assert.match(structural, /<a href="\/blog\/attention-basics\/" class="[^"]*" rel="prev"/);
    assert.doesNotMatch(structural, /rel="next"/, "newest post has no next");
    const related = structural.slice(structural.indexOf('id="related-heading"'));
    assert.match(related, /href="\/blog\/column-buckling-notes\/"/, "shares the 구조공학 tag");
    assert.doesNotMatch(related.slice(0, related.indexOf("</section>")), /attention-basics/, "prev/next are not repeated");
  });

  it("uses the vector card as the list thumbnail", async () => {
    assert.match(await read("posts/index.html"), /src="\/blog\/og\/attention-basics\.svg"/);
    const svg = await read("og/attention-basics.svg");
    assert.match(svg, /^<svg width="1200" height="630"/);
    assert.doesNotMatch(svg, /<text/, "glyphs are outlined, so the SVG needs no fonts");
  });
});

describe("fixture site in a browser", () => {
  let server;
  let browser;

  before(async () => {
    server = await serveDist(DIST);
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  async function open(pathname, options = {}) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/disqus|jsdelivr|Failed to load resource|ERR_/.test(msg.text())) problems.push(msg.text());
    });
    // Third parties (Disqus, CDN fonts) are out of scope and may be offline.
    await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
    await page.goto(`${server.origin}${pathname}`);
    return { page, problems };
  }

  it("renders every page without script errors", async () => {
    for (const pathname of ["/blog/", "/blog/posts/", "/blog/about/", "/blog/structural-analysis-notes/", "/blog/does-not-exist/"]) {
      const { page, problems } = await open(pathname);
      await page.waitForLoadState("networkidle");
      assert.deepEqual(problems, [], pathname);
      await page.context().close();
    }
  });

  it("has no WCAG 2.2 AA accessibility violations (axe-core)", async () => {
    const pages = [
      ["/blog/", 1360],
      ["/blog/posts/", 1360],
      ["/blog/about/", 1360],
      ["/blog/structural-analysis-notes/", 1360],
      ["/blog/structural-analysis-notes/", 390],
      ["/blog/plain-markdown-post/", 390],
      ["/blog/does-not-exist/", 1360],
    ];
    const failures = [];
    for (const [pathname, width] of pages) {
      const { page } = await open(pathname, { viewport: { width, height: 900 } });
      // Let entrance animations and Expressive Code's scroll-region script settle.
      await page.waitForTimeout(800);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      for (const v of violations) {
        failures.push(`${pathname} @${width}px: [${v.impact}] ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
      }
      await page.context().close();
    }
    assert.deepEqual(failures, []);
  });

  it("numbers ordered lists and footnotes, including lists nested in bullets", async () => {
    const { page } = await open("/blog/column-buckling-notes/");
    const styles = await page.evaluate(() =>
      [...document.querySelectorAll(".prose ol")].map((ol) => {
        const li = ol.querySelector("li");
        return {
          list: getComputedStyle(ol).listStyleType,
          before: li ? getComputedStyle(li, "::before").content : "",
        };
      }),
    );
    assert.ok(styles.length > 0);
    for (const s of styles) {
      assert.equal(s.list, "decimal");
      assert.notEqual(s.before, '"-"', "nested ordered items must not get the bullet dash");
    }
    await page.goto(page.url().replace("column-buckling-notes", "structural-analysis-notes"));
    const footnotes = await page.evaluate(() => getComputedStyle(document.querySelector(".footnotes ol")).listStyleType);
    assert.equal(footnotes, "decimal");
    await page.context().close();
  });

  it("highlights the current section in the table of contents", async () => {
    const { page } = await open("/blog/structural-analysis-notes/", { viewport: { width: 1360, height: 900 } });
    const current = page.locator('.toc-sticky [aria-current="location"]');
    assert.equal(await current.getAttribute("data-toc-slug"), "문제-설정");
    await page.locator("#결과-비교").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -100 + document.getElementById("결과-비교").getBoundingClientRect().top));
    await page.waitForFunction(
      () => document.querySelector('.toc-sticky [aria-current="location"]')?.getAttribute("data-toc-slug") === "결과-비교",
    );
    await page.context().close();
  });

  it("works on a phone: menu toggles, inline TOC opens, nothing overflows sideways", async () => {
    const { page } = await open("/blog/structural-analysis-notes/", { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px`);

    const button = page.locator("#mobile-menu-btn");
    await button.click();
    assert.equal(await button.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await button.getAttribute("aria-expanded"), "false");

    await page.locator(".toc-inline summary").click();
    await page.locator(".toc-inline a", { hasText: "결과 비교" }).click();
    await page.waitForFunction(() => location.hash === "#%EA%B2%B0%EA%B3%BC-%EB%B9%84%EA%B5%90" || decodeURIComponent(location.hash) === "#결과-비교");
    assert.equal(await page.locator(".toc-inline").getAttribute("open"), null, "inline TOC closes after a jump");
    await page.context().close();
  });

  it("copies a section link when its # permalink is clicked", async () => {
    const { page, problems } = await open("/blog/structural-analysis-notes/", { viewport: { width: 1360, height: 900 } });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.origin });
    const heading = page.locator("#결과-비교");
    await heading.hover();
    await heading.locator(".heading-anchor").click();
    await page.locator("#copy-toast.show").waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(decodeURIComponent(copied), `${server.origin}/blog/structural-analysis-notes/#결과-비교`);
    assert.equal(decodeURIComponent(new URL(page.url()).hash), "#결과-비교");
    assert.deepEqual(problems, []);
    await page.context().close();
  });

  it("suggests the closest post on a 404 and lists recent posts", async () => {
    const { page } = await open("/blog/attention-basic/");
    const hint = page.locator("#did-you-mean");
    await hint.waitFor();
    assert.equal(await hint.locator("a").getAttribute("href"), "/blog/attention-basics/");
    assert.equal(await page.locator(".recent li").count(), 3);
    const { page: unrelated } = await open("/blog/zzzz-nothing-like-it/");
    await unrelated.waitForTimeout(300);
    assert.equal(await unrelated.locator("#did-you-mean").isHidden(), true);
    await page.context().close();
    await unrelated.context().close();
  });

  it("numbers code lines only where the author asked", async () => {
    const html = await read("structural-analysis-notes/index.html");
    const python = html.slice(html.indexOf('aria-label="코드: deflection.py"'), html.indexOf('aria-label="코드 블록 2 (bash)"'));
    const bash = html.slice(html.indexOf('aria-label="코드 블록 2 (bash)"'));
    assert.match(python, /class="gutter"/);
    assert.doesNotMatch(bash.slice(0, bash.indexOf("</pre>")), /class="gutter"/);
  });

  it("navigates between posts with the client router and keeps scripts alive", async () => {
    const { page, problems } = await open("/blog/posts/");
    await page.locator('a[href="/blog/attention-basics/"]').first().click();
    await page.waitForURL("**/attention-basics/");
    await page.locator("h1", { hasText: "어텐션" }).waitFor();
    // TOC script re-initialised after the swap.
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.waitForFunction(() => document.querySelector('.toc-sticky [aria-current="location"]') !== null);
    assert.deepEqual(problems, []);
    await page.context().close();
  });
});
