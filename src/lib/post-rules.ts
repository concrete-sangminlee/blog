/**
 * Editorial rules for posts: the single source of truth for limits,
 * slugs, publish dates and the prose audit.
 *
 * Imported by the content schema (build-time validation), the audit
 * script (CI), `new-post` (scaffolding), the browser admin (pre-save
 * checks) and the unit tests, so every entry point enforces the same
 * thing. Framework-free and Node-type-strip friendly; see frontmatter.ts.
 */
import { slug as githubSlug } from "github-slugger";
import { FrontmatterError, parsePost, type FrontmatterData } from "./frontmatter.ts";

export const POST_LIMITS = {
  title: { min: 6, max: 100 },
  description: { min: 16, max: 200 },
  tags: { max: 5 },
  /** Minimum body length (raw characters, trimmed) for a published post. */
  publishedBodyMin: 900,
  /** Minimum number of `##` sections for a published post. */
  publishedSectionsMin: 3,
} as const;

export const REQUIRED_KEYS = [
  "title",
  "description",
  "pubDate",
  "tags",
  "draft",
  "verified",
  "featured",
] as const;

/**
 * Phrases that assert a universal claim. Soft Korean hedges such as
 * "보통"/"대부분" already signal personal observation, so they are not here.
 */
export const BROAD_PHRASES = [
  "반드시",
  "항상",
  "일반적으로",
  "일반적인 원칙",
  "일반적인 것",
  "누구나",
  "다들",
  "90%",
  "100%",
] as const;

/**
 * Turn a title into a URL slug. Keeps Hangul, ASCII letters and digits,
 * collapses whitespace/underscores into single hyphens.
 *
 *   slugify("Hello, World!")      -> "hello-world"
 *   slugify("구조 해석 101")        -> "구조-해석-101"
 *   slugify("'유레카' 순간의 진실")  -> "유레카-순간의-진실"
 */
export function slugify(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{Script=Hangul}a-z0-9\s_-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a Date as local ISO-8601 *with* its UTC offset, e.g.
 * `2026-11-04T13:05:00+09:00`. Writing the offset keeps the instant
 * unambiguous: an offset-less timestamp is read as UTC by YAML, which
 * would shift a Korean evening post to the next morning.
 */
export function toOffsetIsoString(date: Date = new Date()): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`
  );
}

/**
 * The id (URL slug) Astro's glob loader gives a post: a `slug` frontmatter
 * key wins, else each path segment of the file name through github-slugger,
 * exactly as astro/dist/content/utils.js getContentEntryIdAndSlug does.
 *
 *   postIdFromPath("My Post.md")        -> "my-post"
 *   postIdFromPath("2026/note.mdx")     -> "2026/note"
 */
export function postIdFromPath(relativePath: string, frontmatterSlug?: unknown): string {
  if (typeof frontmatterSlug === "string" && frontmatterSlug) return frontmatterSlug;
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\.[^./]+$/, "")
    .split("/")
    .map((segment) => githubSlug(segment))
    .join("/")
    .replace(/\/index$/, "");
}

/** Top-level paths the site already uses; a post with one of these ids is never built. */
export const RESERVED_POST_IDS = ["about", "posts", "admin", "og", "images", "404"] as const;

/**
 * Why a post id can't be published, or null when it is fine. Posts are
 * served by the single-segment route src/pages/[slug].astro.
 */
export function postIdProblem(id: string): string | null {
  if (!id) return "the file name has no characters usable in a URL";
  if (id.includes("/")) {
    return `posts can't live in sub-folders (would be /${id}/); move the file directly into the blog folder`;
  }
  if ((RESERVED_POST_IDS as readonly string[]).includes(id)) {
    return `the address /${id}/ is already used by the site; choose another file name or slug`;
  }
  return null;
}

const HAS_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/;

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  /** 1-based line in the source file; 0 when the finding is file-level. */
  line: number;
  rule: string;
  message: string;
}

/**
 * Replace fenced code blocks (``` and ~~~) and inline code with blanks of
 * equal shape, so prose rules never fire on code while line numbers stay
 * exact. A `# comment` inside a bash block is not an <h1>.
 */
export function maskCode(body: string): { prose: string; unclosedFenceLine: number | null } {
  const lines = body.split("\n");
  let fence: { marker: string; line: number } | null = null;
  const out = lines.map((line, index) => {
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close?.[1] && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) {
        fence = null;
      }
      return "";
    }
    if (open?.[1]) {
      fence = { marker: open[1], line: index };
      return "";
    }
    return line.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, (m) => " ".repeat(m.length));
  });
  const unclosed = fence as { marker: string; line: number } | null;
  return { prose: out.join("\n"), unclosedFenceLine: unclosed ? unclosed.line : null };
}

/** Strip math so `$...$` / `$$...$$` don't count as prose or trip rules. */
function maskMath(prose: string): string {
  return prose
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?<![\\$])\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d)/g, (m) => " ".repeat(m.length));
}

/** True when the body uses `$...$` / `$$...$$` math outside of code. */
export function hasMathSyntax(body: string): boolean {
  const { prose } = maskCode(body);
  return /\$\$[\s\S]+?\$\$/.test(prose) || /(?<![\\$])\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d)/.test(prose);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export interface AuditOptions {
  /** Defaults to `Date.now()`; injectable for deterministic tests. */
  now?: number;
  /** Site base path, used to catch root-relative links that skip it. */
  base?: string;
}

/**
 * Audit one post. Errors block CI and admin saves; warnings are advisory.
 * Rules that only matter for published writing are skipped for drafts.
 */
export function auditPost(source: string, options: AuditOptions = {}): Finding[] {
  const now = options.now ?? Date.now();
  const base = (options.base ?? "/blog").replace(/\/$/, "");
  const findings: Finding[] = [];
  const add = (severity: Severity, line: number, rule: string, message: string) =>
    findings.push({ severity, line, rule, message });

  let data: FrontmatterData;
  let body: string;
  let offset: number;
  try {
    const parsed = parsePost(source);
    data = parsed.data;
    body = parsed.body;
    offset = parsed.bodyStartLine - 1;
  } catch (error) {
    const message = error instanceof FrontmatterError ? error.message : String(error);
    add("error", 1, "frontmatter", message);
    return findings;
  }

  for (const key of REQUIRED_KEYS) {
    if (data[key] === undefined || data[key] === null || data[key] === "") {
      add("error", 1, "required-key", `missing ${key} in frontmatter`);
    }
  }

  const isDraft = data["draft"] === true;
  if (data["draft"] === false && data["verified"] !== true) {
    add("error", 1, "verified", "published posts must set verified: true");
  }

  const title = asString(data["title"])?.trim() ?? "";
  const description = asString(data["description"])?.trim() ?? "";
  if (title && title.length < POST_LIMITS.title.min) {
    add("error", 1, "title-length", `title is too short (min ${POST_LIMITS.title.min})`);
  }
  if (title.length > POST_LIMITS.title.max) {
    add("error", 1, "title-length", `title is too long (max ${POST_LIMITS.title.max})`);
  }
  if (description && description.length < POST_LIMITS.description.min) {
    add("error", 1, "description-length", `description is too short (min ${POST_LIMITS.description.min})`);
  }
  if (description.length > POST_LIMITS.description.max) {
    add("error", 1, "description-length", `description is too long (max ${POST_LIMITS.description.max})`);
  }
  if (description.length > 160) {
    add("warning", 1, "description-length", "description over 160 chars is truncated in most search results");
  }

  const tags = data["tags"];
  if (tags !== undefined && !Array.isArray(tags)) {
    add("error", 1, "tags", "tags must be a list");
  } else if (Array.isArray(tags)) {
    if (tags.length > POST_LIMITS.tags.max) {
      add("error", 1, "tags", `at most ${POST_LIMITS.tags.max} tags`);
    }
    const lowered = tags.map((tag) => String(tag).trim().toLowerCase());
    if (lowered.some((tag) => tag === "")) add("error", 1, "tags", "tags must be non-empty strings");
    if (new Set(lowered).size !== lowered.length) add("error", 1, "tags", "duplicate tags");
  }

  const pub = parseDate(data["pubDate"]);
  if (data["pubDate"] !== undefined && !pub) {
    add("error", 1, "pub-date", `pubDate ${String(data["pubDate"])} is not a valid date`);
  }
  if (pub && pub.valueOf() > now) {
    add("error", 1, "pub-date", `pubDate ${String(data["pubDate"])} is in the future`);
  }
  if (typeof data["pubDate"] === "string" && /T/.test(data["pubDate"]) && !HAS_OFFSET_RE.test(data["pubDate"])) {
    add("warning", 1, "pub-date", "pubDate has a time but no UTC offset (e.g. +09:00); YAML reads it as UTC");
  }
  const updated = parseDate(data["updatedDate"]);
  if (data["updatedDate"] !== undefined && !updated) {
    add("error", 1, "updated-date", "updatedDate is not a valid date");
  }
  if (pub && updated && updated < pub) {
    add("error", 1, "updated-date", "updatedDate is earlier than pubDate");
  }

  const { prose: noCode, unclosedFenceLine } = maskCode(body);
  if (unclosedFenceLine !== null) {
    add("error", unclosedFenceLine + 1 + offset, "code-fence", "code fence is never closed");
  }
  const prose = maskMath(noCode);
  const proseLines = prose.split("\n");

  const headings: { depth: number; text: string; line: number }[] = [];
  proseLines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match?.[1] && match[2]) {
      headings.push({ depth: match[1].length, text: match[2], line: index + 1 + offset });
    }
  });

  for (const heading of headings) {
    if (heading.depth === 1) {
      add("error", heading.line, "h1", 'body contains a top-level "# " heading; the title is already the <h1>');
    }
  }
  let previousDepth = 1;
  for (const heading of headings) {
    if (heading.depth > previousDepth + 1) {
      add("warning", heading.line, "heading-order", `heading jumps from h${previousDepth} to h${heading.depth}`);
    }
    previousDepth = heading.depth;
  }

  if (!isDraft) {
    const bodyLength = body.trim().length;
    if (bodyLength < POST_LIMITS.publishedBodyMin) {
      add("error", 0, "body-length", `body is too short for a publishable essay (${bodyLength}/${POST_LIMITS.publishedBodyMin})`);
    }
    const sections = headings.filter((h) => h.depth === 2);
    if (sections.length < POST_LIMITS.publishedSectionsMin) {
      add("error", 0, "sections", `expected at least ${POST_LIMITS.publishedSectionsMin} "## " sections (found ${sections.length})`);
    }
    const generic = sections.find((h) => h.text.trim() === "결론");
    if (generic) add("error", generic.line, "generic-heading", 'generic heading "결론" remains');
  }

  proseLines.forEach((line, index) => {
    const lineNo = index + 1 + offset;
    if (line.includes("—")) add("error", lineNo, "em-dash", "em dash (—) detected");
    for (const phrase of BROAD_PHRASES) {
      if (line.includes(phrase)) add("warning", lineNo, "broad-phrase", `broad phrase "${phrase}" needs context`);
    }
    for (const match of line.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)/g)) {
      if (!match[1]?.trim()) add("error", lineNo, "image-alt", `image ${match[2]} has no alt text`);
    }
    for (const match of line.matchAll(/\]\(\s*<?(\/[^)\s>]*)|\b(?:src|href)=["'](\/[^"']*)/g)) {
      const url = match[1] ?? match[2] ?? "";
      if (url.startsWith("//")) continue;
      if (url !== base && !url.startsWith(`${base}/`)) {
        add("error", lineNo, "base-path", `root-relative URL ${url} skips the site base "${base}/" and will 404`);
      }
    }
  });

  // remark-math pairs ANY two "$" in a paragraph, so "$2에서 $3" renders
  // "2에서 " as math and the dollar signs vanish. Math this audit already
  // recognised was masked above; whatever "$" remain are prices or typos.
  let paragraphStart = -1;
  let dollars = 0;
  const flushParagraph = () => {
    if (dollars >= 2) {
      add(
        "error",
        paragraphStart + 1 + offset,
        "stray-dollar",
        'two or more "$" in one paragraph will be read as math: write \\$ for a dollar sign, or keep inline math as $x$ on one line',
      );
    }
    paragraphStart = -1;
    dollars = 0;
  };
  proseLines.forEach((line, index) => {
    if (line.trim() === "" || /^#{1,6}\s/.test(line)) {
      flushParagraph();
      return;
    }
    if (paragraphStart < 0) paragraphStart = index;
    dollars += (line.match(/(?<!\\)\$/g) ?? []).length;
  });
  flushParagraph();

  if (data["math"] !== true && hasMathSyntax(body)) {
    add("warning", 0, "math", "body contains $...$ math but math: true is not set");
  }

  return findings.sort((a, b) => a.line - b.line);
}

export function hasErrors(findings: readonly Finding[]): boolean {
  return findings.some((finding) => finding.severity === "error");
}
