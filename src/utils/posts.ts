import { getCollection, type CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;

const postModules = import.meta.glob("../content/blog/*.mdx");

// Filter predicate for getCollection: drops drafts in production,
// keeps them in dev so drafts are visible during local iteration.
const isPublished = ({ data }: BlogPost): boolean =>
  import.meta.env.PROD ? !data.draft : true;

const FEATURED_POST_ORDER = [] as const;

export async function getAllPosts(): Promise<readonly BlogPost[]> {
  if (Object.keys(postModules).length === 0) {
    return [];
  }

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
