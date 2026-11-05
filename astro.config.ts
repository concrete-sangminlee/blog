import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import expressiveCode from "astro-expressive-code";
import tailwindcss from "@tailwindcss/vite";
import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeProse from "./src/lib/markdown/rehype-prose.ts";
import { codeBlockLabels } from "./src/lib/markdown/ec-code-labels.ts";
import { postLastModified } from "./src/lib/sitemap.ts";

const SITE = "https://concrete-sangminlee.github.io";
const BASE = "/blog/";
const postDates = postLastModified(process.env["BLOG_CONTENT_DIR"] ?? "./src/content/blog", BASE);
const newestPost = [...postDates.values()].sort((a, b) => b.valueOf() - a.valueOf())[0];

export default defineConfig({
  site: SITE,
  base: BASE,
  // All internal links are rendered with a trailing slash (/post/), the
  // sitemap + canonical URLs match, and GitHub Pages serves directories
  // as-is. Setting "always" keeps Astro's own URL checks consistent.
  trailingSlash: "always",
  // Keep v5-era whitespace semantics: the "jsx" default introduced in v7
  // drops the space between adjacent inline elements in templates.
  compressHTML: true,
  // Prefetch internal links as they scroll into view so the ClientRouter
  // swaps against already-cached HTML.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
  integrations: [
    expressiveCode({
      // The site is dark-only, so ship a single code theme instead of a
      // light/dark pair whose light half could never be shown.
      themes: ["vitesse-dark"],
      plugins: [codeBlockLabels()],
      styleOverrides: {
        borderRadius: "0.5rem",
        codePaddingBlock: "1rem",
        codePaddingInline: "1.25rem",
        codeFontFamily: "var(--font-mono)",
        uiFontFamily: "var(--font-body)",
      },
    }),
    mdx(),
    sitemap({
      filter: (page) => !page.includes("/admin/"),
      // <lastmod> from frontmatter: a post's updatedDate (else pubDate);
      // the home and list pages change whenever the newest post does.
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        const listing = pathname === BASE || pathname === `${BASE}posts/`;
        const lastmod = postDates.get(pathname) ?? (listing ? newestPost : undefined);
        return lastmod ? { ...item, lastmod: lastmod.toISOString() } : item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      // rehypeHeadingIds is listed explicitly so ids (and the TOC's heading
      // text) are fixed before rehypeProse appends permalink anchors.
      rehypePlugins: [rehypeKatex, rehypeHeadingIds, rehypeProse],
      remarkRehype: {
        footnoteLabel: "각주",
        footnoteBackLabel: (referenceIndex: number, rereferenceIndex: number) =>
          `본문 ${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ""}번 위치로 돌아가기`,
      },
    }),
  },
});
