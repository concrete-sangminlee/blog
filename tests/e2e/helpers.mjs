import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

/** Serve a build directory at /blog/ the way GitHub Pages does. */
export async function serveDist(dir, base = "/blog/") {
  const root = path.resolve(dir);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let file = null;
    if (url.pathname.startsWith(base)) {
      const rel = decodeURIComponent(url.pathname.slice(base.length));
      const candidate = path.join(root, rel);
      if (candidate.startsWith(root)) {
        const target = url.pathname.endsWith("/") ? path.join(candidate, "index.html") : candidate;
        if (await stat(target).then((s) => s.isFile(), () => false)) file = target;
      }
    }
    const status = file ? 200 : 404;
    file ??= path.join(root, "404.html");
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    let body = await readFile(file);
    const headers = {
      "Content-Type": type,
      // GitHub Pages sends this on every file; the admin's sandboxed
      // (opaque-origin) preview relies on it to load KaTeX fonts.
      "Access-Control-Allow-Origin": "*",
      // Pages compresses text, so measurements (Lighthouse) see real sizes.
      Vary: "Accept-Encoding",
    };
    if (/text|javascript|json|xml|svg/.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
      body = gzipSync(body);
      headers["Content-Encoding"] = "gzip";
    }
    res.writeHead(status, headers);
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

export function launchBrowser() {
  // CHROMIUM_PATH lets sandboxes with a preinstalled browser skip
  // `playwright install`; CI uses Playwright's own download.
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}
