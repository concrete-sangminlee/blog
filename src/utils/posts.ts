import { getCollection, type CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;

// Filter predicate for getCollection: drops drafts in production,
// keeps them in dev so drafts are visible during local iteration.
export const isPublished = ({ data }: BlogPost): boolean =>
  import.meta.env.PROD ? !data.draft : true;

const FEATURED_POST_ORDER = [
  "paper-writing-tips",
  "thinking-about-quitting",
  "pre-phd-me-wouldnt-believe",
  "dataset-error-discovery",
  "beating-baseline",
] as const;

export async function getAllPosts(): Promise<readonly BlogPost[]> {
  try {
    const posts = await getCollection("blog", isPublished);
    return posts.sort(
      (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
    );
  } catch {
    return [];
  }
}

export async function getFeaturedPosts(): Promise<readonly BlogPost[]> {
  const posts = await getAllPosts();
  const featuredRank = new Map<string, number>(
    FEATURED_POST_ORDER.map((slug, index) => [slug, index]),
  );

  return posts
    .filter((post) => post.data.featured || featuredRank.has(post.slug))
    .sort((a, b) => {
      const aRank = featuredRank.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
      const bRank = featuredRank.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    });
}

export async function getPostsByTag(tag: string): Promise<readonly BlogPost[]> {
  const posts = await getAllPosts();
  return posts.filter((post) =>
    post.data.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase()),
  );
}

export async function getAllTags(): Promise<Map<string, number>> {
  const posts = await getAllPosts();
  // Group case-insensitively, but remember the first-seen casing so "AI"
  // keeps its original display shape across tag index, tag detail pages,
  // and post cards.
  const byKey = new Map<string, { display: string; count: number }>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const key = tag.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(key, { display: tag, count: 1 });
      }
    }
  }
  const sorted = [...byKey.values()].sort((a, b) => b.count - a.count);
  return new Map(sorted.map((v) => [v.display, v.count]));
}
