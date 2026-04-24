import { getCollection, type CollectionEntry } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";
import { SITE } from "@/data/site.config";
import { renderOgSvg } from "@/utils/og-svg";
import { isPublished } from "@/utils/posts";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection("blog", isPublished);

  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { post },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const post = props.post as CollectionEntry<"blog">;
  const svg = renderOgSvg({
    title: post.data.title,
    description: post.data.description,
    eyebrow: SITE.title.toUpperCase(),
    footer: `/${post.slug}/`,
    tags: post.data.tags,
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
