/**
 * Frontmatter parsing and serialisation shared by the audit script,
 * `new-post`, the browser admin and the unit tests.
 *
 * Framework-free on purpose: this file runs under Node's built-in type
 * stripping (scripts/*.mjs), inside Vite (the admin page) and in Vitest,
 * so it must only use erasable TypeScript syntax and `.ts` import paths.
 */
import { parseDocument } from "yaml";

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue };

export type FrontmatterData = Record<string, FrontmatterValue>;

export interface ParsedPost {
  data: FrontmatterData;
  body: string;
  /** 1-based line number of the first body line in the original source. */
  bodyStartLine: number;
}

export class FrontmatterError extends Error {
  override name = "FrontmatterError";
}

const FENCE_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split a post into its YAML block and body. Throws when the file does not
 * start with a `---` fenced block, because every post needs frontmatter.
 */
export function splitFrontmatter(source: string): {
  yaml: string;
  body: string;
  bodyStartLine: number;
} {
  const text = source.replace(/^﻿/, "");
  const match = text.match(FENCE_RE);
  if (!match) throw new FrontmatterError("frontmatter block is missing");
  const consumed = match[0];
  return {
    yaml: match[1] ?? "",
    body: text.slice(consumed.length),
    bodyStartLine: consumed.split("\n").length,
  };
}

/**
 * Parse frontmatter with the same YAML dialect Astro uses (YAML 1.2 core
 * schema with merge keys), but WITHOUT the timestamp tag: dates stay as the
 * exact strings the author wrote, so a load/save round trip in the admin
 * never rewrites `2026-05-01T09:00:00+09:00` into a UTC instant.
 */
export function parsePost(source: string): ParsedPost {
  const { yaml, body, bodyStartLine } = splitFrontmatter(source);
  const doc = parseDocument(yaml, { schema: "core", merge: true });
  const firstError = doc.errors[0];
  if (firstError) throw new FrontmatterError(`invalid YAML: ${firstError.message}`);
  const value: unknown = doc.toJS();
  if (value === null || value === undefined) return { data: {}, body, bodyStartLine };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new FrontmatterError("frontmatter must be a YAML mapping");
  }
  return { data: value as FrontmatterData, body, bodyStartLine };
}

/** Keys are written in this order; anything else follows alphabetically. */
const KEY_ORDER = [
  "title",
  "description",
  "pubDate",
  "updatedDate",
  "tags",
  "draft",
  "verified",
  "featured",
  "math",
  "image",
] as const;

const DATE_KEYS = new Set(["pubDate", "updatedDate"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function serializeValue(key: string, value: FrontmatterValue): string {
  // Dates are written bare so YAML reads them as timestamps, matching what
  // `npm run new-post` has always produced.
  if (DATE_KEYS.has(key) && typeof value === "string" && ISO_DATE_RE.test(value)) {
    return value;
  }
  // JSON is a strict subset of YAML flow syntax, so JSON.stringify gives a
  // correctly escaped scalar/sequence/mapping for any quote, colon, `#`,
  // backslash or newline an author can type.
  return JSON.stringify(value);
}

export function serializeFrontmatter(data: FrontmatterData): string {
  const known = KEY_ORDER.filter((key) => data[key] !== undefined);
  const extra = Object.keys(data)
    .filter((key) => !(KEY_ORDER as readonly string[]).includes(key) && data[key] !== undefined)
    .sort();
  const lines = [...known, ...extra].map((key) => {
    const value = data[key] as FrontmatterValue;
    return `${key}: ${serializeValue(key, value)}`;
  });
  return `---\n${lines.join("\n")}\n---\n`;
}

/** Serialise a full post. The body always ends with exactly one newline. */
export function serializePost(data: FrontmatterData, body: string): string {
  const trimmed = body.replace(/^\s*\n/, "").trimEnd();
  return `${serializeFrontmatter(data)}\n${trimmed}\n`;
}
