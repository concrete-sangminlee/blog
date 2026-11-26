import { createProcessor } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Finding } from "./post-rules.ts";

/**
 * Parse a .mdx body the way the build will (MDX + GFM + math). Markdown
 * habits that MDX rejects (<!-- comments -->, <br>, <https://…> autolinks,
 * "a<b", a bare {…}) otherwise pass every check and only fail the deploy.
 *
 * Separate from post-rules.ts so the admin can load the MDX parser lazily,
 * only when it saves an .mdx file.
 */
export async function checkMdxSyntax(body: string, lineOffset = 0): Promise<Finding[]> {
  const processor = createProcessor({ format: "mdx", remarkPlugins: [remarkGfm, remarkMath] });
  try {
    processor.parse(body);
    return [];
  } catch (error) {
    const e = error as { reason?: string; message?: string; line?: number; place?: { line?: number; start?: { line?: number } } };
    const line = e.line ?? e.place?.start?.line ?? e.place?.line ?? 0;
    const reason = e.reason ?? e.message ?? String(error);
    return [
      {
        severity: "error",
        line: line ? line + lineOffset : 0,
        rule: "mdx-syntax",
        message: `MDX can't parse this (${reason}). In .mdx files write HTML comments as {/* … */}, self-close tags (<br />), use [text](url) instead of <url>, and escape a literal < or { with a backslash`,
      },
    ];
  }
}
