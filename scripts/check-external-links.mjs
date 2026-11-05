#!/usr/bin/env node
/**
 * Link-rot check: request every external URL the posts link to and fail if
 * any is gone (404/410) or keeps erroring. Runs weekly in CI
 * (.github/workflows/links.yml) because external sites change on their own
 * schedule, not when we push.
 *
 *   npm run check:links [-- --dir=tests/fixtures/blog]
 *
 * Sites that refuse robots (401/403/429) or time out once are reported as
 * warnings, not failures: a person can still open them.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parsePost } from "../src/lib/frontmatter.ts";
import { extractExternalLinks } from "../src/lib/links.ts";

const ROOT = path.join(import.meta.dirname, "..");
const dirArg = process.argv.find((arg) => arg.startsWith("--dir="))?.slice("--dir=".length);
const DIR = path.resolve(ROOT, dirArg ?? process.env.BLOG_CONTENT_DIR ?? "src/content/blog");
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; blog-link-check; +https://concrete-sangminlee.github.io/blog/)",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
};

async function listPosts() {
  try {
    const entries = await readdir(DIR, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.mdx?$/.test(e.name) && !e.name.startsWith("_"))
      .map((e) => path.join(e.parentPath, e.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function request(url, method) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await response.body?.cancel();
  return response.status;
}

/** "ok" | "warn" | "broken", with the status or error that decided it. */
async function check(url) {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // HEAD first; many servers mishandle it, so fall back to GET.
      let status = await request(url, "HEAD");
      if (status === 405 || status === 403 || status === 400 || status === 404) status = await request(url, "GET");
      if (status < 400) return { result: "ok", detail: status };
      if (status === 404 || status === 410) return { result: "broken", detail: status };
      if (status === 401 || status === 403 || status === 429) return { result: "warn", detail: status };
      last = `HTTP ${status}`;
    } catch (error) {
      last = error?.name === "TimeoutError" ? "timeout" : String(error?.cause?.code ?? error?.message ?? error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { result: last === "timeout" ? "warn" : "broken", detail: last };
}

const occurrences = new Map(); // url -> ["file:line", …]
for (const file of await listPosts()) {
  const source = await readFile(file, "utf8");
  let parsed;
  try {
    parsed = parsePost(source);
  } catch {
    continue; // the editorial audit reports broken frontmatter
  }
  const rel = path.relative(ROOT, file);
  for (const { url, line } of extractExternalLinks(parsed.body, parsed.bodyStartLine - 1)) {
    occurrences.set(url, [...(occurrences.get(url) ?? []), `${rel}:${line}`]);
  }
  if (typeof parsed.data.image === "object" && /^https?:/.test(parsed.data.image?.url ?? "")) {
    occurrences.set(parsed.data.image.url, [...(occurrences.get(parsed.data.image.url) ?? []), `${rel}:image`]);
  }
}

const urls = [...occurrences.keys()];
const results = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      results.set(url, await check(url));
    }
  }),
);

const lines = (kind) =>
  urls
    .filter((url) => results.get(url)?.result === kind)
    .map((url) => `  ${url} (${results.get(url).detail}) ← ${occurrences.get(url).join(", ")}`);
const broken = lines("broken");
const warned = lines("warn");
if (warned.length) console.warn(`Unverifiable (blocked or slow), check by hand:\n${warned.join("\n")}`);
if (broken.length) {
  console.error(`Broken external links:\n${broken.join("\n")}`);
  process.exit(1);
}
console.log(`External links OK: ${urls.length - warned.length}/${urls.length} verified in ${path.relative(ROOT, DIR) || "."}.`);
