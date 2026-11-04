#!/usr/bin/env node
/**
 * Verify a built site before it ships:
 *
 * - every internal link, image, stylesheet and script resolves to a file
 *   in the build, and every `#fragment` points at an id that exists;
 * - every indexable page has one <h1>, a title, a description, a canonical
 *   URL and valid JSON-LD; no page has duplicate ids or images without alt;
 * - og:image files exist and PNG cards are exactly 1200×630;
 * - the sitemap lists only pages that exist, and never the admin or 404.
 *
 *   node scripts/check-dist.mjs [dist-dir]
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SITE = "https://concrete-sangminlee.github.io";
const BASE = "/blog/";
const distDir = path.resolve(process.argv[2] ?? "dist");

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

async function walk(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** Map a site URL path (/blog/x/) to the file GitHub Pages would serve. */
async function resolveFile(urlPath) {
  if (!urlPath.startsWith(BASE)) return null;
  const rel = decodeURIComponent(urlPath.slice(BASE.length));
  const candidate = path.join(distDir, rel);
  if (!candidate.startsWith(distDir)) return null;
  if (urlPath.endsWith("/")) {
    const index = path.join(candidate, "index.html");
    return (await exists(index)) ? index : null;
  }
  if (await exists(candidate)) return candidate;
  return null;
}

const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const htmlCache = new Map();
async function idsOf(file) {
  if (!htmlCache.has(file)) {
    const html = await readFile(file, "utf8");
    htmlCache.set(file, new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => decode(m[1]))));
  }
  return htmlCache.get(file);
}

function pngSize(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function checkUrl(file, raw, attr) {
  const fail = (_, message) => errors.push(`${path.relative(distDir, file)}: ${message}`);
  const value = decode(raw.trim());
  if (!value || /^(?:mailto:|tel:|data:|javascript:|blob:)/i.test(value)) return;

  let url;
  try {
    url = new URL(value, `${SITE}${BASE}${path.relative(distDir, path.dirname(file)).split(path.sep).join("/")}/`);
  } catch {
    fail(file, `unparseable ${attr} "${value}"`);
    return;
  }
  if (url.origin !== SITE) return; // external: not checked offline
  if (!url.pathname.startsWith(BASE)) {
    fail(file, `${attr} "${value}" points outside the site base ${BASE}`);
    return;
  }

  // A bare "#id" always refers to the current document (404.html lives at
  // the root but is served for every missing URL).
  const target = value.startsWith("#") ? file : await resolveFile(url.pathname);
  if (!target) {
    fail(file, `broken ${attr}: ${value}`);
    return;
  }
  if (url.hash && url.hash !== "#" && target.endsWith(".html")) {
    const id = decodeURIComponent(url.hash.slice(1));
    if (!(await idsOf(target)).has(id)) fail(file, `${attr} "${value}" points at missing #${id}`);
  }
}

async function checkPage(file) {
  const html = await readFile(file, "utf8");
  const rel = path.relative(distDir, file);
  const isAdmin = rel.startsWith(`admin${path.sep}`);
  const noIndex = /<meta name="robots" content="noindex/.test(html);

  for (const match of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    await checkUrl(file, match[2], match[1]);
  }
  for (const match of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const part of match[1].split(",")) await checkUrl(file, part.trim().split(/\s+/)[0] ?? "", "srcset");
  }

  if (!/<html lang="[^"]+"/.test(html)) fail(rel, "missing <html lang>");
  if (!/<title>[^<]+<\/title>/.test(html)) fail(rel, "missing <title>");

  const ids = [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) fail(rel, `duplicate id(s): ${dupes.join(", ")}`);

  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(img[0])) fail(rel, `<img> without alt: ${img[0].slice(0, 80)}`);
  }

  if (isAdmin) {
    if (!/http-equiv="Content-Security-Policy"/.test(html)) fail(rel, "admin page lost its Content-Security-Policy");
    if (/<script(?![^>]*\ssrc=)[^>]*>(?!\s*<\/script>)/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""))) {
      fail(rel, "admin page has an inline script, which its CSP blocks");
    }
    return;
  }
  if (noIndex) return;

  const h1s = (html.match(/<h1\b/g) ?? []).length;
  if (h1s !== 1) fail(rel, `expected exactly one <h1>, found ${h1s}`);
  if (!/<meta name="description" content="[^"]{10,}"/.test(html)) fail(rel, "missing meta description");
  if (!/<link rel="canonical" href="https:\/\/[^"]+"/.test(html)) fail(rel, "missing canonical URL");

  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      fail(rel, `invalid JSON-LD: ${error.message}`);
    }
  }

  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!ogImage) {
    fail(rel, "missing og:image");
  } else {
    const url = new URL(decode(ogImage));
    if (url.origin === SITE) {
      const image = await resolveFile(url.pathname);
      if (!image) fail(rel, `og:image ${ogImage} does not exist`);
      else if (image.endsWith(".png")) {
        const size = pngSize(await readFile(image));
        if (!size || size.width !== 1200 || size.height !== 630) {
          fail(rel, `og:image ${ogImage} is ${size ? `${size.width}×${size.height}` : "not a PNG"}, expected 1200×630`);
        }
      }
    }
  }
}

async function checkSitemap() {
  const index = path.join(distDir, "sitemap-index.xml");
  if (!(await exists(index))) {
    fail("sitemap-index.xml", "missing");
    return;
  }
  const files = (await walk(distDir)).filter((f) => /sitemap-\d+\.xml$/.test(f));
  for (const file of files) {
    const xml = await readFile(file, "utf8");
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = new URL(loc);
      if (/\/(?:admin|404)\b/.test(url.pathname)) fail(path.basename(file), `lists ${loc}`);
      else if (!(await resolveFile(url.pathname))) fail(path.basename(file), `lists missing page ${loc}`);
    }
  }
}

const all = await walk(distDir);
const pages = all.filter((f) => f.endsWith(".html"));
for (const page of pages) await checkPage(page);
await checkSitemap();

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\ncheck-dist: ${errors.length} problem(s) in ${path.relative(process.cwd(), distDir)}`);
  process.exit(1);
}
console.log(`check-dist: ${pages.length} pages, ${all.length} files OK (${path.relative(process.cwd(), distDir)})`);
