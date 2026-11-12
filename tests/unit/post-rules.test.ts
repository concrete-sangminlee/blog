import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditPost,
  hasErrors,
  hasMathSyntax,
  maskCode,
  postIdFromPath,
  postIdProblem,
  slugify,
  toOffsetIsoString,
  type Finding,
} from "../../src/lib/post-rules.ts";
import { serializePost } from "../../src/lib/frontmatter.ts";

const NOW = Date.parse("2026-11-04T00:00:00Z");

function post(body: string, overrides: Record<string, unknown> = {}): string {
  return serializePost(
    {
      title: "테스트용 글 제목",
      description: "감사 규칙을 확인하기 위한 테스트용 설명 문장입니다.",
      pubDate: "2026-05-01T09:00:00+09:00",
      tags: ["테스트"],
      draft: false,
      verified: true,
      featured: false,
      ...(overrides as Record<string, never>),
    },
    body,
  );
}

const LONG_BODY = ["## 하나", "가".repeat(400), "## 둘", "나".repeat(400), "## 셋", "다".repeat(200)].join("\n\n");
const rules = (findings: Finding[]) => findings.map((f) => `${f.severity}:${f.rule}`);

describe("slugify", () => {
  const cases: [string, string][] = [
    ["Hello, World!", "hello-world"],
    ["구조 해석 101", "구조-해석-101"],
    ["'유레카' 순간의 진실", "유레카-순간의-진실"],
    ["  spaces   and__underscores  ", "spaces-and-underscores"],
    ["A -- B", "a-b"],
    ["!!!", ""],
    ["C++와 Rust 비교", "c와-rust-비교"],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => assert.equal(slugify(input), expected));
  }

  it("normalises decomposed Hangul (NFD from macOS file names)", () => {
    assert.equal(slugify("한글".normalize("NFD")), "한글");
  });
});

describe("toOffsetIsoString", () => {
  it("always includes an explicit UTC offset", () => {
    assert.match(toOffsetIsoString(new Date()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("round-trips to the same instant", () => {
    const date = new Date("2026-03-02T00:30:15Z");
    assert.equal(new Date(toOffsetIsoString(date)).valueOf(), date.valueOf());
  });
});

describe("maskCode", () => {
  it("blanks fenced code but keeps line count", () => {
    const body = "a\n```bash\n# not a heading\n```\nb";
    const { prose, unclosedFenceLine } = maskCode(body);
    assert.equal(prose.split("\n").length, 5);
    assert.ok(!prose.includes("not a heading"));
    assert.equal(unclosedFenceLine, null);
  });

  it("blanks inline code and supports ~~~ and longer fences", () => {
    const { prose } = maskCode("use `—` here\n````md\n```\ninner\n```\n````\nafter");
    assert.ok(!prose.includes("—"));
    assert.ok(!prose.includes("inner"));
    assert.ok(prose.includes("after"));
  });

  it("reports an unclosed fence", () => {
    assert.equal(maskCode("x\n```js\ncode").unclosedFenceLine, 1);
  });
});

describe("hasMathSyntax", () => {
  it("detects inline and display math", () => {
    assert.ok(hasMathSyntax("응력 $\\sigma = E\\varepsilon$ 이다"));
    assert.ok(hasMathSyntax("$$\nx^2\n$$"));
  });
  it("ignores prices, escaped dollars and code", () => {
    assert.ok(!hasMathSyntax("가격은 $5 그리고 $10 이다"));
    assert.ok(!hasMathSyntax("`$x$` 는 코드"));
    assert.ok(!hasMathSyntax("```\n$x$\n```"));
  });
});

describe("auditPost", () => {
  it("passes a well-formed published post", () => {
    const findings = auditPost(post(LONG_BODY), { now: NOW });
    assert.deepEqual(findings, []);
  });

  it("requires verified: true to publish", () => {
    assert.ok(rules(auditPost(post(LONG_BODY, { verified: false }), { now: NOW })).includes("error:verified"));
  });

  it("skips length/section rules for drafts but keeps style rules", () => {
    const findings = rules(auditPost(post("짧은 초안 — 메모", { draft: true, verified: false }), { now: NOW }));
    assert.ok(!findings.includes("error:body-length"));
    assert.ok(!findings.includes("error:sections"));
    assert.ok(findings.includes("error:em-dash"));
  });

  it("reports every em dash with its real line number", () => {
    const source = post(`${LONG_BODY}\n\n첫째 — 줄\n\n둘째 — 줄`);
    const dashes = auditPost(source, { now: NOW }).filter((f) => f.rule === "em-dash");
    const lines = source.split("\n");
    assert.equal(dashes.length, 2);
    for (const finding of dashes) assert.ok(lines[finding.line - 1]?.includes("—"));
  });

  it("does not treat code comments as headings or code as prose", () => {
    const body = `${LONG_BODY}\n\n\`\`\`bash\n# install — deps\n## also a comment\n\`\`\``;
    assert.deepEqual(auditPost(post(body), { now: NOW }), []);
  });

  it("flags a body-level h1, skipped heading levels and the generic 결론 heading", () => {
    const body = `# 두 번째 h1\n\n${LONG_BODY}\n\n#### 깊은 제목\n\n## 결론\n\n끝.`;
    const found = rules(auditPost(post(body), { now: NOW }));
    assert.ok(found.includes("error:h1"));
    assert.ok(found.includes("warning:heading-order"));
    assert.ok(found.includes("error:generic-heading"));
  });

  it("enforces title, description and tag limits", () => {
    const found = rules(
      auditPost(post(LONG_BODY, { title: "짧음", description: "짧은 설명", tags: ["a", "b", "c", "d", "e", "f"] }), {
        now: NOW,
      }),
    );
    assert.ok(found.includes("error:title-length"));
    assert.ok(found.includes("error:description-length"));
    assert.ok(found.includes("error:tags"));
    assert.ok(rules(auditPost(post(LONG_BODY, { tags: ["AI", "ai"] }), { now: NOW })).includes("error:tags"));
  });

  it("validates dates", () => {
    assert.ok(rules(auditPost(post(LONG_BODY, { pubDate: "2027-01-01T00:00:00+09:00" }), { now: NOW })).includes("error:pub-date"));
    assert.ok(rules(auditPost(post(LONG_BODY, { pubDate: "2026-05-01T09:00:00" }), { now: NOW })).includes("warning:pub-date"));
    assert.ok(
      rules(auditPost(post(LONG_BODY, { updatedDate: "2026-04-01T09:00:00+09:00" }), { now: NOW })).includes(
        "error:updated-date",
      ),
    );
  });

  it("catches links that skip the /blog base and images without alt", () => {
    const body = `${LONG_BODY}\n\n[다른 글](/other-post/) ![](/blog/images/a.png) <img src="/images/b.png" alt="b" />\n\n[정상](/blog/ok/) [외부](https://example.com/)`;
    const found = auditPost(post(body), { now: NOW });
    assert.equal(found.filter((f) => f.rule === "base-path").length, 2);
    assert.equal(found.filter((f) => f.rule === "image-alt").length, 1);
  });

  it("warns about math without math: true, and about broad phrases", () => {
    const found = rules(auditPost(post(`${LONG_BODY}\n\n항상 $x^2$ 이다.`), { now: NOW }));
    assert.ok(found.includes("warning:math"));
    assert.ok(found.includes("warning:broad-phrase"));
    assert.ok(!hasErrors(auditPost(post(`${LONG_BODY}\n\n항상 $x^2$ 이다.`), { now: NOW })));
  });

  it("reports unclosed code fences and broken frontmatter", () => {
    assert.ok(rules(auditPost(post(`${LONG_BODY}\n\n\`\`\`js\nopen`), { now: NOW })).includes("error:code-fence"));
    assert.deepEqual(rules(auditPost("no frontmatter")), ["error:frontmatter"]);
  });

  it("reports missing required keys", () => {
    const found = auditPost('---\ntitle: "제목이 있는 글"\n---\n', { now: NOW });
    assert.deepEqual(
      found.filter((f) => f.rule === "required-key").map((f) => f.message),
      ["description", "pubDate", "tags", "draft", "verified", "featured"].map((k) => `missing ${k} in frontmatter`),
    );
  });
});

describe("post ids", () => {
  it("matches Astro's glob loader (github-slugger per segment)", () => {
    assert.equal(postIdFromPath("My Post With Spaces.md"), "my-post-with-spaces");
    assert.equal(postIdFromPath("한글 제목_글.v2.mdx"), "한글-제목_글v2");
    assert.equal(postIdFromPath("2026/note.mdx"), "2026/note");
    assert.equal(postIdFromPath("guide/index.md"), "guide");
    assert.equal(postIdFromPath("anything.md", "custom-slug"), "custom-slug");
  });

  it("rejects ids the [slug] route can't serve", () => {
    assert.equal(postIdProblem("structural-analysis-notes"), null);
    assert.match(postIdProblem("2026/note") ?? "", /sub-folders/);
    for (const id of ["about", "posts", "admin", "og", "images", "404"]) {
      assert.match(postIdProblem(id) ?? "", /already used/, id);
    }
    assert.match(postIdProblem("") ?? "", /no characters/);
  });
});

describe("stray dollar signs", () => {
  const strays = (body: string) =>
    auditPost(post(`${LONG_BODY}\n\n${body}`), { now: NOW }).filter((f) => f.rule === "stray-dollar");

  it("flags two prices in one paragraph (remark-math would eat them)", () => {
    assert.equal(strays("GPU 대여비는 시간당 $2에서 $3 정도다.").length, 1);
    assert.equal(strays("입력은 $3,\n출력은 $15이다.").length, 1, "soft line breaks stay in the paragraph");
  });

  it("accepts math, escaped dollars and lone prices", () => {
    assert.deepEqual(strays("응력 $\\sigma$ 와 변형률 $\\varepsilon$ 의 관계"), []);
    assert.deepEqual(strays("시간당 \\$2에서 \\$3 정도다."), []);
    assert.deepEqual(strays("가격은 $5 이다.\n\n다른 문단은 $7 이다."), []);
    assert.deepEqual(strays("```bash\necho $HOME $PATH\n```"), []);
  });
});
