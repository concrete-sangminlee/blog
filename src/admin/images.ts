/**
 * In-browser image preparation for the admin.
 *
 * Photos straight off a phone are 3–12 MB; the content column is 720 px.
 * Raster images are downscaled to MAX_WIDTH and re-encoded as WebP before
 * they ever reach the repository, keeping the site light and the git
 * history small. Files are named by content hash, so re-adding the same
 * image is a no-op and caches never serve a stale copy.
 */

/** 2× the 720 px content column, so images stay sharp on retina screens. */
export const MAX_WIDTH = 1600;
const WEBP_QUALITY = 0.85;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export interface PreparedImage {
  /** Repository path, e.g. public/images/my-post/beam-1a2b3c4d.webp */
  repoPath: string;
  /** Site URL, e.g. /blog/images/my-post/beam-1a2b3c4d.webp */
  url: string;
  bytes: Uint8Array;
  type: string;
  width: number;
  height: number;
  originalBytes: number;
}

export class ImageRejected extends Error {
  override name = "ImageRejected";
}

const PASSTHROUGH = new Set(["image/gif"]); // may be animated: never re-encode
const RASTER = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/bmp"]);
const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/avif": "avif",
};

async function shortHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

function baseName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").normalize("NFKD").toLowerCase();
  // ASCII-only names keep URLs readable in Markdown and in git history.
  const ascii = stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return ascii || "image";
}

async function encode(bitmap: ImageBitmap, width: number, height: number, type: string): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageRejected("이미지를 처리할 수 없습니다 (canvas 사용 불가).");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type, quality: WEBP_QUALITY });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageRejected("이미지를 처리할 수 없습니다 (canvas 사용 불가).");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageRejected("이미지 인코딩에 실패했습니다."))), type, WEBP_QUALITY),
  );
}

/**
 * Validate, downscale and re-encode one file.
 * @param folder  post slug used as the image folder (public/images/<folder>/)
 * @param siteBase  e.g. "/blog"
 */
export async function prepareImage(file: File, folder: string, siteBase: string): Promise<PreparedImage> {
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    // An SVG served from this origin can run script, and this origin holds
    // the admin token. Rasterise diagrams to PNG before uploading.
    throw new ImageRejected("SVG는 보안상 올릴 수 없습니다. PNG나 WebP로 내보내서 올려 주세요.");
  }
  if (!PASSTHROUGH.has(file.type) && !RASTER.has(file.type)) {
    throw new ImageRejected(`${file.name}: 지원하지 않는 형식입니다 (${file.type || "알 수 없음"}).`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageRejected(`${file.name}: 25MB보다 큰 파일은 올릴 수 없습니다.`);
  }

  const original = new Uint8Array(await file.arrayBuffer());
  let bytes = original;
  let type = file.type;
  let width = 0;
  let height = 0;

  if (RASTER.has(file.type)) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
      throw new ImageRejected(`${file.name}: 이미지를 읽을 수 없습니다.`);
    });
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    width = Math.round(bitmap.width * scale);
    height = Math.round(bitmap.height * scale);

    let blob = await encode(bitmap, width, height, "image/webp");
    // Browsers without a WebP encoder silently return PNG. Re-encode as PNG
    // explicitly (lossless, keeps transparency); the size check below then
    // keeps the original file unless resizing made the new one necessary.
    if (blob.type !== "image/webp") blob = await encode(bitmap, width, height, "image/png");
    bitmap.close();

    const encoded = new Uint8Array(await blob.arrayBuffer());
    const resized = scale < 1;
    if (resized || encoded.byteLength < original.byteLength || file.type === "image/bmp") {
      bytes = encoded;
      type = blob.type;
    }
  }

  const ext = EXTENSIONS[type] ?? "bin";
  const name = `${baseName(file.name)}-${await shortHash(bytes)}.${ext}`;
  const dir = folder || "drafts";
  return {
    repoPath: `public/images/${dir}/${name}`,
    url: `${siteBase}/images/${dir}/${name}`,
    bytes,
    type,
    width,
    height,
    originalBytes: original.byteLength,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
