import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMdxSyntax } from "../../src/lib/mdx-syntax.ts";

describe("checkMdxSyntax", () => {
  it("accepts what the blog's MDX pipeline accepts", async () => {
    for (const body of ["수식 $\\frac{a}{b}$ 와 **굵게**", '<Callout type="tip">\n본문\n</Callout>', "{/* 메모 */}", "줄<br />바꿈"]) {
      assert.deepEqual(await checkMdxSyntax(body), [], body);
    }
  });

  it("reports Markdown habits MDX rejects, with the line", async () => {
    for (const body of ["<!-- 메모 -->", "줄<br>바꿈", "<https://example.com>", "a<b", "{a: 1}"]) {
      const [finding] = await checkMdxSyntax(`첫 줄\n\n${body}\n`, 10);
      assert.equal(finding?.rule, "mdx-syntax", body);
      assert.equal(finding?.line, 13, body);
    }
  });
});
