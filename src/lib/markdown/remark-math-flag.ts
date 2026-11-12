import type { Root } from "mdast";
import { EXIT, visit } from "unist-util-visit";

interface AstroVFileData {
  astro?: { frontmatter?: Record<string, unknown> };
}

/**
 * Records whether remark-math actually produced any math in this post, as
 * `hasMath` in Astro's remarkPluginFrontmatter. PostLayout loads the KaTeX
 * stylesheet from this instead of guessing with a regex: a guess that
 * disagrees with the parser leaves rendered math unstyled (the MathML and
 * HTML copies both show).
 */
export default function remarkMathFlag() {
  return (tree: Root, file: { data: AstroVFileData }) => {
    let found = false;
    visit(tree, (node) => {
      if (node.type === "math" || node.type === "inlineMath") {
        found = true;
        return EXIT;
      }
      return undefined;
    });
    if (!found) return;
    file.data.astro ??= {};
    file.data.astro.frontmatter ??= {};
    file.data.astro.frontmatter["hasMath"] = true;
  };
}
