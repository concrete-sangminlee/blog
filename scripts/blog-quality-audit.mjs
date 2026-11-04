#!/usr/bin/env node
/**
 * Editorial audit for every post. Uses the exact rules the admin and the
 * content schema use (src/lib/post-rules.ts, run via Node's type
 * stripping), so a post that passes here can't fail elsewhere.
 *
 *   npm run audit:blog                       # errors only
 *   npm run audit:blog -- --show-warnings    # errors + warnings
 *   npm run audit:blog -- --dir=tests/fixtures/blog
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { auditPost, slugify } from "../src/lib/post-rules.ts";
import { parsePost } from "../src/lib/frontmatter.ts";

// `--flag` and `--flag=value`; `--show-warnings=true` keeps working too.
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key = "", value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const showWarnings = args.get("show-warnings") === "true";

const ROOT = path.join(import.meta.dirname, "..");
const BLOG_DIR = path.resolve(ROOT, args.get("dir") ?? process.env.BLOG_CONTENT_DIR ?? "src/content/blog");

async function listPosts(dir) {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name) && !entry.name.startsWith("_"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

const files = await listPosts(BLOG_DIR);
const errors = [];
const warnings = [];
const seen = new Map();

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const source = await readFile(file, "utf8");
  for (const finding of auditPost(source)) {
    const where = finding.line > 0 ? `${rel}:${finding.line}` : rel;
    (finding.severity === "error" ? errors : warnings).push(`${where}: ${finding.message} [${finding.rule}]`);
  }

  // Astro derives the URL from the file path (or a `slug` key); two posts
  // that slug to the same id would silently overwrite each other.
  let id = path.relative(BLOG_DIR, file).replace(/\.mdx?$/, "").split(path.sep).map(slugify).join("/");
  try {
    const { data } = parsePost(source);
    if (typeof data.slug === "string") id = data.slug;
  } catch {
    /* already reported */
  }
  if (seen.has(id)) errors.push(`${rel}: URL /${id}/ collides with ${seen.get(id)} [duplicate-slug]`);
  else seen.set(id, rel);
}

if (showWarnings && warnings.length > 0) console.warn(warnings.join("\n"));
if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`\nBlog audit failed: ${errors.length} error(s) in ${files.length} post(s).`);
  process.exit(1);
}

console.log(`Blog audit passed: ${files.length} post(s) in ${path.relative(ROOT, BLOG_DIR) || "."}.`);
if (warnings.length > 0 && !showWarnings) {
  console.log(`Context warnings: ${warnings.length}. Use --show-warnings to inspect.`);
}
