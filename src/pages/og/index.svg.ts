import type { APIRoute } from "astro";
import { SITE } from "@/data/site.config";
import { renderOgSvg } from "@/utils/og-svg";

export const prerender = true;

export const GET: APIRoute = () => {
  const svg = renderOgSvg({
    title: SITE.title,
    description: SITE.description,
    eyebrow: "PERSONAL BLOG",
    footer: "concrete-sangminlee.github.io/blog/",
    tags: ["AI", "Research", "Graduate School"],
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
