import type { Element, ElementContent, Root } from "hast";
import { toString } from "hast-util-to-string";
import { visit } from "unist-util-visit";

const HEADING_RE = /^h[2-4]$/;
export const FOOTNOTE_LABEL_ID = "footnote-label";

/**
 * Post-processing for rendered Markdown/MDX prose:
 *
 * - Appends a focusable `#` permalink to every h2–h4 that has an id, so a
 *   reader can copy a link to a section. Labelled for screen readers;
 *   runs after Astro's heading-id pass so TOC text stays clean.
 * - Wraps tables in a horizontally scrollable, keyboard-focusable region
 *   so wide tables don't blow out the page width on phones.
 * - Lazy-loads and async-decodes prose images.
 * - Marks external links `rel="noopener noreferrer"` without forcing a
 *   new tab (readers decide that themselves).
 */
export default function rehypeProse() {
  return (tree: Root) => {
    let tables = 0;
    visit(tree, "element", (node, index, parent) => {
      if (HEADING_RE.test(node.tagName) && typeof node.properties["id"] === "string") {
        // GFM's visually hidden "각주" heading is not a real section.
        if (node.properties["id"] !== FOOTNOTE_LABEL_ID) appendAnchor(node, node.properties["id"]);
        return;
      }

      if (node.tagName === "table" && parent && typeof index === "number") {
        if (parent.type === "element" && hasClass(parent, "table-scroll")) return;
        const wrapper: Element = {
          type: "element",
          tagName: "div",
          properties: {
            className: ["table-scroll"],
            tabIndex: 0,
            role: "region",
            // Numbered so several tables don't share one region name.
            ariaLabel: `표 ${++tables} (가로로 스크롤 가능)`,
          },
          children: [node],
        };
        parent.children[index] = wrapper;
        return;
      }

      if (node.tagName === "img") {
        node.properties["loading"] ??= "lazy";
        node.properties["decoding"] ??= "async";
        return;
      }

      if (node.tagName === "a") {
        const href = node.properties["href"];
        if (typeof href === "string" && /^https?:\/\//.test(href)) {
          node.properties["rel"] = ["noopener", "noreferrer"];
        }
      }
    });
  };
}

function hasClass(node: Element, name: string): boolean {
  const className = node.properties["className"];
  return Array.isArray(className) && className.includes(name);
}

function appendAnchor(heading: Element, id: string) {
  const text = toString(heading).trim();
  const anchor: ElementContent = {
    type: "element",
    tagName: "a",
    properties: {
      className: ["heading-anchor"],
      href: `#${id}`,
      ariaLabel: `‘${text}’ 섹션 링크`,
    },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: { ariaHidden: "true" },
        children: [{ type: "text", value: "#" }],
      },
    ],
  };
  heading.children.push(anchor);
}
