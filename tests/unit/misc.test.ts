import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base64ToUtf8, utf8ToBase64 } from "../../src/lib/encoding.ts";
import { formatDateLong, formatDateShort } from "../../src/lib/dates.ts";
import { getReadingMinutes } from "../../src/lib/reading-time.ts";

describe("encoding", () => {
  it("round-trips Korean, emoji and astral characters", () => {
    const text = "구조공학 🏗️ 𝔼[x] — \u0000 끝";
    assert.equal(base64ToUtf8(utf8ToBase64(text)), text);
  });

  it("matches Node's own UTF-8 Base64 (what GitHub stores)", () => {
    const text = "한글 본문\n둘째 줄";
    assert.equal(utf8ToBase64(text), Buffer.from(text, "utf8").toString("base64"));
    // GitHub wraps base64 at 60 columns; whitespace must be ignored.
    const wrapped = Buffer.from(text, "utf8").toString("base64").replace(/(.{8})/g, "$1\n");
    assert.equal(base64ToUtf8(wrapped), text);
  });

  it("handles large inputs without blowing the call stack", () => {
    const text = "가".repeat(200_000);
    assert.equal(base64ToUtf8(utf8ToBase64(text)), text);
  });

  it("refuses invalid UTF-8 instead of producing mojibake", () => {
    assert.throws(() => base64ToUtf8(Buffer.from([0xff, 0xfe, 0xfd]).toString("base64")));
  });
});

describe("dates", () => {
  it("formats in Asia/Seoul regardless of the machine time zone", () => {
    // 2026-03-01T16:30Z is already March 2nd in Seoul.
    const date = new Date("2026-03-01T16:30:00Z");
    assert.equal(formatDateLong(date), "2026년 3월 2일");
    assert.equal(formatDateShort(date), "2026년 3월 2일");
  });
});

describe("getReadingMinutes", () => {
  it("is at least one minute", () => assert.equal(getReadingMinutes(""), 1));

  it("counts Hangul by syllable (~500/min)", () => {
    assert.equal(getReadingMinutes("가".repeat(1000)), 2);
    assert.equal(getReadingMinutes("가".repeat(1001)), 3);
  });

  it("counts other scripts by word (~200/min)", () => {
    assert.equal(getReadingMinutes(Array(400).fill("word").join(" ")), 2);
  });

  it("ignores code, math, MDX imports, tags and URLs", () => {
    const noise = [
      'import Figure from "@/components/mdx/Figure.astro";',
      "```js",
      ...Array(500).fill("const x = 1;"),
      "```",
      "$$\n" + "x + ".repeat(500) + "\n$$",
      "<Figure src='/blog/a.png' alt='a' />",
      "https://example.com/" + "a/".repeat(300),
    ].join("\n");
    // One code block adds a fixed skim cost, not 500 lines of reading.
    assert.equal(getReadingMinutes(noise), 1);
  });
});
