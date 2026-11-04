import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import expressiveCode from "astro-expressive-code";
import tailwindcss from "@tailwindcss/vite";
import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeProse from "./src/lib/markdown/rehype-prose.ts";

export default defineConfig({
  site: "https://concrete-sangminlee.github.io",
  base: "/blog/",
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
