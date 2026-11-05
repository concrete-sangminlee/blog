/**
 * Sitemap <lastmod> values, read straight from post frontmatter.
 *
 * Node-only (imported by astro.config.ts, which runs before Astro's content
 * layer exists, so it can't use getCollection). Uses the same parser as the
 * audit, so a date the audit accepts is the date search engines see.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parsePost } from "./frontmatter.ts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(typeof value === "string" && DATE_ONLY.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

/**
 * Map of post URL path (e.g. "/blog/my-post/") to its last-modified date.
 * Drafts and `_`-prefixed files are skipped, matching the build.
 */
export function postLastModified(contentDir: string, base: string): Map<string, Date> {
  const dates = new Map<string, Date>();
  let files: string[];
  try {
    files = readdirSync(contentDir, { recursive: true, encoding: "utf8" });
  } catch {
    return dates;
  }
  const prefix = base.endsWith("/") ? base : `${base}/`;
  for (const rel of files) {
    const name = path.basename(rel);
    if (!/\.mdx?$/.test(name) || name.startsWith("_")) continue;
    try {
      const { data } = parsePost(readFileSync(path.join(contentDir, rel), "utf8"));
      if (data["draft"] === true) continue;
      const modified = toDate(data["updatedDate"]) ?? toDate(data["pubDate"]);
      if (!modified) continue;
      // Astro's glob loader: `slug` frontmatter wins, else the path stem.
      const id =
        typeof data["slug"] === "string"
          ? data["slug"]
          : rel.replace(/\.mdx?$/, "").split(path.sep).join("/").toLowerCase();
      dates.set(`${prefix}${encodeURI(id)}/`, modified);
    } catch {
      /* the audit reports unreadable posts */
    }
  }
  return dates;
}
