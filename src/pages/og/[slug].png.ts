import type { APIRoute, GetStaticPaths } from "astro";
import { cardOptionsFor } from "@/utils/social-card-options";
import { renderSocialCard } from "@/utils/og-image";
import { getAllPosts, type BlogPost } from "@/utils/posts";

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getAllPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
};

export const GET: APIRoute<{ post: BlogPost }> = async ({ props }) => {
  const png = await renderSocialCard(cardOptionsFor(props.post));
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
