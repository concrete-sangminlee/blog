import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Fonts for the social-card renderer.
 *
 * satori needs TTF/OTF/WOFF files with full Hangul coverage. The only npm
 * package that ships Pretendard's Korean TTFs weighs 72 MB, so instead the
 * two weights we use are downloaded once from jsDelivr's npm mirror, pinned
 * to an exact version AND a SHA-256 digest, then cached on disk. A changed
 * or corrupted file fails the build loudly rather than rendering tofu.
 *
 * Offline builds: drop the .ttf files into the cache directory (or point
 * OG_FONT_DIR at a folder that has them) and nothing is fetched.
 */

const VERSION = "1.3.9";
const BASE = `https://cdn.jsdelivr.net/npm/pretendard@${VERSION}/dist/public/static/alternative`;

export const OG_FONTS = [
  {
    file: "Pretendard-Regular.ttf",
    weight: 400,
    sha256: "6d0af5258997aec7354a6e340fc2325ba321c410ca48b3af858c8c3d6e92a324",
  },
  {
    file: "Pretendard-Bold.ttf",
    weight: 700,
    sha256: "c16b88c670d23e83fa1170c954cbc4822d3b8dad3c3cde15d798a94b43d97985",
  },
] as const;

export type OgFontWeight = (typeof OG_FONTS)[number]["weight"];

const cacheDir = () =>
  process.env["OG_FONT_DIR"] ??
  path.join(process.cwd(), "node_modules", ".cache", "og-fonts", `pretendard-${VERSION}`);

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

async function readVerified(file: string, expected: string): Promise<Buffer | null> {
  try {
    const data = await readFile(file);
    return sha256(data) === expected ? data : null;
  } catch {
    return null;
  }
}

async function download(url: string, attempts = 3): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw new Error(`Could not download ${url}: ${String(lastError)}`);
}

async function loadFont(font: (typeof OG_FONTS)[number]): Promise<Buffer> {
  const dir = cacheDir();
  const target = path.join(dir, font.file);
  const cached = await readVerified(target, font.sha256);
  if (cached) return cached;

  const data = await download(`${BASE}/${font.file}`);
  const digest = sha256(data);
  if (digest !== font.sha256) {
    throw new Error(
      `${font.file}: SHA-256 mismatch (expected ${font.sha256}, got ${digest}). ` +
        "Refusing to use an unverified font.",
    );
  }
  await mkdir(dir, { recursive: true });
  // Write-then-rename so a concurrent or interrupted build never leaves a
  // truncated file behind.
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, data);
  await rename(temp, target);
  return data;
}

let loaded: Promise<{ weight: OgFontWeight; data: Buffer }[]> | null = null;

export function loadOgFonts(): Promise<{ weight: OgFontWeight; data: Buffer }[]> {
  loaded ??= Promise.all(
    OG_FONTS.map(async (font) => ({ weight: font.weight, data: await loadFont(font) })),
  );
  return loaded;
}
