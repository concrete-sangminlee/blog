/**
 * UTF-8 safe Base64, for the GitHub contents API.
 *
 * `btoa`/`atob` only handle Latin-1: feeding them Korean text either throws
 * or silently produces mojibake. These helpers go through bytes instead.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunk to stay under the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function base64ToUtf8(base64: string): string {
  const binary = atob(base64.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
