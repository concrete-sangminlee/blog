import type { Root } from "hast";
import type { VFile } from "vfile";

/**
 * rehype-katex reports TeX it can't render (a typo, an undefined command)
 * only as a vfile message, which Astro discards, and ships the source in
 * red. Run right after rehypeKatex: fail the build instead, naming the
 * file, line and KaTeX's own reason.
 */
export default function rehypeKatexStrict() {
  return (_tree: Root, file: VFile) => {
    const problems = file.messages.filter((m) => m.source === "rehype-katex");
    if (problems.length === 0) return;
    const details = problems
      .map((m) => {
        const cause = m.cause instanceof Error ? m.cause.message : m.reason;
        return `  line ${m.line ?? "?"}: ${cause}`;
      })
      .join("\n");
    file.fail(`KaTeX could not render ${problems.length} formula(s) in ${file.path ?? "this post"}:\n${details}`);
  };
}
