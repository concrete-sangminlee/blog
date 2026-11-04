import { SITE } from "@/data/site.config";
import { formatDateLong } from "@/lib/dates";
import type { SocialCardOptions } from "@/utils/og-image";
import type { BlogPost } from "@/utils/posts";

export function cardOptionsFor(post: BlogPost): SocialCardOptions {
  return {
    eyebrow: SITE.title,
    title: post.data.title,
    description: post.data.description,
    tags: post.data.tags,
    footer: formatDateLong(post.data.pubDate),
  };
}
