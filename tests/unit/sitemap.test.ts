import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { postLastModified } from "../../src/lib/sitemap.ts";

const dir = mkdtempSync(path.join(tmpdir(), "sitemap-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const post = (front: string) => `---\n${front}\n---\n\n본문\n`;
writeFileSync(path.join(dir, "updated.mdx"), post("pubDate: 2026-01-01T09:00:00+09:00\nupdatedDate: 2026-02-01T09:00:00+09:00"));
writeFileSync(path.join(dir, "plain.md"), post("pubDate: 2026-03-01"));
writeFileSync(path.join(dir, "구조-해석.mdx"), post("pubDate: 2026-04-01T00:00:00Z"));
writeFileSync(path.join(dir, "custom.mdx"), post('pubDate: 2026-05-01T00:00:00Z\nslug: "renamed"'));
writeFileSync(path.join(dir, "draft.mdx"), post("pubDate: 2026-06-01T00:00:00Z\ndraft: true"));
writeFileSync(path.join(dir, "_partial.mdx"), post("pubDate: 2026-07-01T00:00:00Z"));
writeFileSync(path.join(dir, "broken.mdx"), "no frontmatter");
mkdirSync(path.join(dir, "notes"));

describe("postLastModified", () => {
  const dates = postLastModified(dir, "/blog/");
  const iso = (key: string) => dates.get(key)?.toISOString();

  it("prefers updatedDate and falls back to pubDate", () => {
    assert.equal(iso("/blog/updated/"), "2026-02-01T00:00:00.000Z");
    assert.equal(iso("/blog/plain/"), "2026-03-01T00:00:00.000Z");
  });

  it("keys Korean slugs the way URLs encode them", () => {
    assert.equal(iso(new URL("https://x/blog/구조-해석/").pathname), "2026-04-01T00:00:00.000Z");
  });

  it("honours a frontmatter slug", () => {
    assert.equal(iso("/blog/renamed/"), "2026-05-01T00:00:00.000Z");
    assert.equal(dates.has("/blog/custom/"), false);
  });

  it("skips drafts, partials and unreadable files", () => {
    assert.deepEqual([...dates.keys()].sort(), ["/blog/plain/", "/blog/renamed/", "/blog/updated/", new URL("https://x/blog/구조-해석/").pathname].sort());
  });

  it("returns an empty map for a missing directory", () => {
    assert.equal(postLastModified(path.join(dir, "nope"), "/blog").size, 0);
  });
});
