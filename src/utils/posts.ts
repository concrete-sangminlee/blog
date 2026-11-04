import { getCollection, type CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;

// Drafts are visible in `astro dev` so they can be previewed, and dropped
// from production builds.
const isPublished = ({ data }: BlogPost): boolean =>
  import.meta.env.PROD ? !data.draft : true;

const byNewest = (a: BlogPost, b: BlogPost) =>
  b.data.pubDate.valueOf() - a.data.pubDate.valueOf() || a.id.localeCompare(b.id);

/**
 * All visible posts, newest first. Schema errors are NOT swallowed here:
 * a malformed post must fail the build rather than silently vanish.
 */
export async function getAllPosts(): Promise<readonly BlogPost[]> {
  const posts = await getCollection("blog", isPublished);
  return posts.sort(byNewest);
}

export async function getFeaturedPosts(): Promise<readonly BlogPost[]> {
  return (await getAllPosts()).filter((post) => post.data.featured);
}

/** Last time the content changed: updatedDate when set, else pubDate. */
export function lastModified(post: BlogPost): Date {
  return post.data.updatedDate ?? post.data.pubDate;
}

/**
 * Posts that share the most tags with `post`, ties broken by recency.
 * Posts with no shared tag are never suggested.
 */
export function relatedPosts(
  post: BlogPost,
  all: readonly BlogPost[],
  limit = 3,
): BlogPost[] {
  const tags = new Set(post.data.tags.map((tag) => tag.toLowerCase()));
  if (tags.size === 0) return [];
  return all
    .filter((other) => other.id !== post.id)
    .map((other) => ({
      other,
      score: other.data.tags.filter((tag) => tags.has(tag.toLowerCase())).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || byNewest(a.other, b.other))
    .slice(0, limit)
    .map(({ other }) => other);
}
