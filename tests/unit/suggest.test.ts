import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closestPost, editDistance, requestedSlug } from "../../src/lib/suggest.ts";

const posts = [
  { id: "structural-analysis-notes", title: "단순보 처짐" },
  { id: "attention-basics", title: "어텐션" },
  { id: "구조-해석-입문", title: "구조 해석 입문" },
];

describe("editDistance", () => {
  it("counts insertions, deletions and substitutions", () => {
    assert.equal(editDistance("kitten", "sitting"), 3);
    assert.equal(editDistance("", "abc"), 3);
    assert.equal(editDistance("같다", "같다"), 0);
    assert.equal(editDistance("구조해석", "구조-해석"), 1);
  });
});

describe("requestedSlug", () => {
  it("extracts and decodes the last path segment", () => {
    assert.equal(requestedSlug("/blog/attention-basic/", "/blog/"), "attention-basic");
    assert.equal(requestedSlug("/blog/%EA%B5%AC%EC%A1%B0-%ED%95%B4%EC%84%9D/", "/blog/"), "구조-해석");
    assert.equal(requestedSlug("/blog/old/path/Attention_Basics.html", "/blog/"), "attention-basics");
    assert.equal(requestedSlug("/blog/", "/blog/"), "");
    assert.equal(requestedSlug("/blog/%E0%A4%A/", "/blog/"), "%e0%a4%a");
  });
});

describe("closestPost", () => {
  it("finds typos and truncations", () => {
    assert.equal(closestPost("attention-basic", posts)?.id, "attention-basics");
    assert.equal(closestPost("structual-analysis-note", posts)?.id, "structural-analysis-notes");
    assert.equal(closestPost("structural", posts)?.id, "structural-analysis-notes");
    assert.equal(closestPost("구조-해석", posts)?.id, "구조-해석-입문");
  });

  it("stays quiet when nothing is close", () => {
    assert.equal(closestPost("completely-unrelated-words", posts), null);
    assert.equal(closestPost("", posts), null);
    assert.equal(closestPost("abc", []), null);
  });
});
