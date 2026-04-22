import { href } from "@/utils/paths";
import type { BlogPost } from "@/utils/posts";

export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;

export function getDefaultSocialImage(): string {
  return href("/og/index.svg");
}

export function getPostSocialImage(post: BlogPost): string {
  return post.data.image?.url ?? href(`/og/${post.slug}.svg`);
}

export function getPostSocialImageAlt(post: BlogPost): string {
  return post.data.image?.alt ?? `${post.data.title} 대표 이미지`;
}
