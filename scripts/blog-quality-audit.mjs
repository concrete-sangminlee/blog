import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Anchor to the script location so the audit works regardless of where
// npm or the user invokes it from.
const BLOG_DIR = path.join(import.meta.dirname, "..", "src/content/blog");
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

// Only flag phrases that assert a universal claim. "보통"/"대부분" are soft
// hedges in Korean that already signal personal observation, so including
// them here produced noise that didn't actually point to over-generalization.
const broadPhrases = [
  "반드시",
  "항상",
  "일반적으로",
  "일반적인 원칙",
  "일반적인 것",
  "누구나",
  "다들",
  "90%",
  "100%",
];

function parseFrontmatter(source, file) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`${file}: frontmatter block is missing`);
  }

  const data = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    data[key.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
  }

  return { data, body: match[2] };
}

function lineNumber(source, needle) {
  const index = source.indexOf(needle);
  if (index < 0) return 1;
  return source.slice(0, index).split("\n").length;
}

function auditPost(file, source) {
  const issues = [];
  const warnings = [];
  const { data, body } = parseFrontmatter(source, file);
  const headings = [...body.matchAll(/^## /gm)].length;

  for (const key of ["title", "description", "pubDate", "tags", "draft", "featured"]) {
    if (!data[key]) issues.push(`${file}: missing ${key} in frontmatter`);
  }

  if ((data.title ?? "").length < 6) issues.push(`${file}: title is too short`);
  if ((data.description ?? "").length < 16) issues.push(`${file}: description is too short`);
  if (body.trim().length < 900) issues.push(`${file}: body is too short for a publishable essay`);
  if (headings < 3) issues.push(`${file}: expected at least three section headings`);
  if (/^## 결론$/m.test(body)) issues.push(`${file}: generic final heading "결론" remains`);

  // Catch accidentally future-dated posts. They would still build, but the
  // blog listing would show a date that hasn't happened yet — usually a
  // typo in the pubDate.
  const pub = data.pubDate ? new Date(data.pubDate) : null;
  if (pub && !Number.isNaN(pub.valueOf()) && pub.valueOf() > Date.now()) {
    issues.push(`${file}: pubDate ${data.pubDate} is in the future`);
  }

  for (const phrase of broadPhrases) {
    if (body.includes(phrase)) {
      warnings.push(`${file}:${lineNumber(source, phrase)}: broad phrase "${phrase}" needs context`);
    }
  }

  return { issues, warnings };
}

async function main() {
  const files = (await readdir(BLOG_DIR))
    .filter((file) => file.endsWith(".mdx"))
    .sort();

  const allIssues = [];
  const allWarnings = [];

  for (const file of files) {
    const source = await readFile(path.join(BLOG_DIR, file), "utf8");
    const { issues, warnings } = auditPost(file, source);
    allIssues.push(...issues);
    allWarnings.push(...warnings);
  }

  if (allWarnings.length > 0 && args.get("show-warnings") === "true") {
    console.warn(allWarnings.join("\n"));
  }

  if (allIssues.length > 0) {
    console.error(allIssues.join("\n"));
    process.exit(1);
  }

  console.log(`Blog audit passed: ${files.length} posts.`);
  if (allWarnings.length > 0) {
    console.log(`Context warnings: ${allWarnings.length}. Use --show-warnings=true to inspect.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
