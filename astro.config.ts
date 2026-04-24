import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import expressiveCode from "astro-expressive-code";
import tailwindcss from "@tailwindcss/vite";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export default defineConfig({
  site: "https://concrete-sangminlee.github.io",
  base: "/blog/",
  integrations: [
    expressiveCode({
      // List light first so it becomes the default (first-listed) theme
      // applied to :root when no `data-theme` is set yet — the site's own
      // base palette is also light.
      themes: ["vitesse-light", "vitesse-dark"],
      // Map expressive-code's theme selectors onto the site's own
      // `data-theme="dark"` / `data-theme="light"` attribute instead of
      // the default `data-theme="vitesse-dark"`, so code blocks follow
      // the site toggle rather than the OS preference.
      themeCssSelector: (theme) =>
        theme.name === "vitesse-dark"
          ? '[data-theme="dark"]'
          : '[data-theme="light"]',
      useDarkModeMediaQuery: false,
      styleOverrides: {
        borderRadius: "0.5rem",
        codePaddingBlock: "1rem",
        codePaddingInline: "1.25rem",
      },
    }),
    mdx(),
    react(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
