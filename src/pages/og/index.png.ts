import type { APIRoute } from "astro";
import { SITE } from "@/data/site.config";
import { renderSocialCard } from "@/utils/og-image";

export const GET: APIRoute = async () => {
  const png = await renderSocialCard({
    eyebrow: "Personal Blog",
    title: SITE.title,
    description: SITE.description,
    tags: ["AI", "연구", "대학원"],
    footer: "concrete-sangminlee.github.io/blog",
  });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
};
