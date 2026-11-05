import type { Element } from "hast";
import type { ExpressiveCodePlugin } from "astro-expressive-code";
import { visit } from "unist-util-visit";

/**
 * Expressive Code turns every horizontally scrollable code block into an
 * unlabelled `role="region"` at runtime, so two such blocks on a page are
 * indistinguishable landmarks (axe: landmark-unique). Give each block a
 * name at build time: its title when it has one, else its position and
 * language.
 */
export function codeBlockLabels(): ExpressiveCodePlugin {
  return {
    name: "Code block labels",
    hooks: {
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        const title = codeBlock.props.title?.trim();
        const position = (codeBlock.parentDocument?.positionInDocument?.groupIndex ?? 0) + 1;
        const language = codeBlock.language && codeBlock.language !== "plaintext" ? ` (${codeBlock.language})` : "";
        const label = title ? `코드: ${title}` : `코드 블록 ${position}${language}`;
        visit(renderData.blockAst, "element", (node: Element) => {
          if (node.tagName === "pre") node.properties["ariaLabel"] = label;
        });
      },
    },
  };
}
