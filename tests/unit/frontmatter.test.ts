import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FrontmatterError, parsePost, serializePost, splitFrontmatter } from "../../src/lib/frontmatter.ts";

const POST = `---
title: "'유레카' 순간: \\"진실\\""
description: "콜론: 과 # 해시, 그리고 \\\\ 역슬래시"
pubDate: 2026-04-15T18:00:00+09:00
tags: ["연구", "에세이"]
draft: false
verified: true
featured: false
image: { url: "/blog/images/a.png", alt: "대체 텍스트" }
customKey: 42
---

본문 첫 줄.

## 절
`;

describe("parsePost", () => {
  it("reads every frontmatter type and keeps dates as written", () => {
    const { data, body, bodyStartLine } = parsePost(POST);
    assert.equal(data["title"], `'유레카' 순간: "진실"`);
    assert.equal(data["description"], "콜론: 과 # 해시, 그리고 \\ 역슬래시");
    assert.equal(data["pubDate"], "2026-04-15T18:00:00+09:00");
    assert.deepEqual(data["tags"], ["연구", "에세이"]);
    assert.equal(data["verified"], true);
    assert.deepEqual(data["image"], { url: "/blog/images/a.png", alt: "대체 텍스트" });
    assert.equal(data["customKey"], 42);
    assert.equal(bodyStartLine, 12);
    assert.equal(body.split("\n")[1], "본문 첫 줄.");
  });

  it("accepts CRLF line endings and a BOM", () => {
    const { data } = parsePost(`﻿---\r\ntitle: "윈도우"\r\n---\r\nbody`);
    assert.equal(data["title"], "윈도우");
  });

  it("rejects files without frontmatter or with broken YAML", () => {
    assert.throws(() => parsePost("# no frontmatter"), FrontmatterError);
    assert.throws(() => parsePost("---\ntitle: [unclosed\n---\n"), FrontmatterError);
    assert.throws(() => parsePost("---\n- a list\n---\n"), FrontmatterError);
  });

  it("splitFrontmatter tolerates an empty body", () => {
    assert.deepEqual(splitFrontmatter("---\na: 1\n---\n"), { yaml: "a: 1", body: "", bodyStartLine: 4 });
  });
});

describe("serializePost", () => {
  it("round-trips without losing or reordering data", () => {
    const parsed = parsePost(POST);
    const text = serializePost(parsed.data, parsed.body);
    const again = parsePost(text);
    assert.deepEqual(again.data, parsed.data);
    assert.equal(again.body.trim(), parsed.body.trim());
    // Stable: serialising twice gives byte-identical output.
    assert.equal(serializePost(again.data, again.body), text);
  });

  it("writes known keys in canonical order and dates bare", () => {
    const text = serializePost(
      { zeta: true, draft: true, title: "제목입니다", pubDate: "2026-01-01T09:00:00+09:00", tags: [] },
      "본문",
    );
    assert.equal(
      text,
      '---\ntitle: "제목입니다"\npubDate: 2026-01-01T09:00:00+09:00\ntags: []\ndraft: true\nzeta: true\n---\n\n본문\n',
    );
  });

  it("quotes values that would otherwise change meaning in YAML", () => {
    for (const title of ["no: colon", "# hash", "yes", "null", "- dash", 'q"uote', "back\\slash", "줄\n바꿈"]) {
      const text = serializePost({ title }, "");
      assert.equal(parsePost(text).data["title"], title, title);
    }
  });

  it("never emits a non-ISO date unquoted", () => {
    const text = serializePost({ pubDate: "next tuesday" }, "");
    assert.match(text, /pubDate: "next tuesday"/);
  });
});
