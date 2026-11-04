import type { APIRoute, GetStaticPaths } from "astro";
import { cardOptionsFor } from "@/utils/social-card-options";
import { renderSocialCardSvg } from "@/utils/og-image";
import { getAllPosts, type BlogPost } from "@/utils/posts";

// Vector twin of /og/[slug].png, used as the post-card thumbnail: same
// layout, text outlined to paths, a fraction of the bytes, sharp at any DPR.
export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getAllPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
};

export const GET: APIRoute<{ post: BlogPost }> = async ({ props }) => {
  const svg = await renderSocialCardSvg(cardOptionsFor(props.post));
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
};
