import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractExternalLinks } from "../../src/lib/links.ts";

describe("extractExternalLinks", () => {
  it("finds links in every syntax, once each, with line numbers", () => {
    const body = [
      "[문서](https://docs.astro.build/en/) 와 ![그림](https://example.com/a.png).",
      "자동 링크 <https://github.com/withastro> 와 그냥 https://katex.org/docs/ 도.",
      '<Figure src="https://cdn.example.org/fig.png" alt="x" /> <a href="https://docs.astro.build/en/">중복</a>',
      "",
      "[ref]: https://www.w3.org/TR/WCAG22/",
    ].join("\n");
    assert.deepEqual(extractExternalLinks(body), [
      { url: "https://docs.astro.build/en/", line: 1 },
      { url: "https://example.com/a.png", line: 1 },
      { url: "https://github.com/withastro", line: 2 },
      { url: "https://katex.org/docs/", line: 2 },
      { url: "https://cdn.example.org/fig.png", line: 3 },
      { url: "https://www.w3.org/TR/WCAG22/", line: 5 },
    ]);
  });

  it("ignores code, internal links and trailing punctuation", () => {
    const body = "```bash\ncurl https://in-code.example\n```\n`https://inline.example` [내부](/blog/x/) 끝은 https://end.example/path.";
    assert.deepEqual(extractExternalLinks(body).map((l) => l.url), ["https://end.example/path"]);
  });
});
