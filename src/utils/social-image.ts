import { href } from "@/utils/paths";
import type { BlogPost } from "@/utils/posts";

export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;

/**
 * Social cards are PNG: X/Twitter, Facebook, LinkedIn, Slack, Discord and
 * KakaoTalk all ignore SVG `og:image`s.
 */
export function getDefaultSocialImage(): string {
  return href("/og/index.png");
}

export function getPostSocialImage(post: BlogPost): string {
  return post.data.image?.url ?? href(`/og/${post.id}.png`);
}

/** Thumbnail for post cards: the author's image, else the vector card. */
export function getPostThumbnail(post: BlogPost): string {
  return post.data.image?.url ?? href(`/og/${post.id}.svg`);
}

export function getPostSocialImageAlt(post: BlogPost): string {
  return post.data.image?.alt ?? `${post.data.title} 대표 이미지`;
}
