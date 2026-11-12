import { getCollection, type CollectionEntry } from "astro:content";
import { postIdProblem } from "@/lib/post-rules";

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
let cached: Promise<readonly BlogPost[]> | null = null;

export function getAllPosts(): Promise<readonly BlogPost[]> {
  // A production build renders every page from the same, immutable
  // collection, and each post page asks for the full list (prev/next,
  // related posts): compute it once instead of once per page. Dev keeps
  // reading fresh so edits show up immediately.
  if (cached) return cached;
  const posts = getCollection("blog", isPublished).then((list) => {
    // Fail with the file name instead of Astro's "Missing parameter: slug"
    // (nested file) or a post that silently never gets a page (reserved id).
    for (const post of list) {
      const problem = postIdProblem(post.id);
      if (problem) throw new Error(`${post.filePath ?? post.id}: ${problem}`);
    }
    return Object.freeze(list.sort(byNewest));
  });
  if (import.meta.env.PROD) cached = posts;
  return posts;
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
  /** Ids already linked elsewhere (prev/next); excluded before the limit. */
  exclude: ReadonlySet<string> = new Set(),
): BlogPost[] {
  const tags = new Set(post.data.tags.map((tag) => tag.toLowerCase()));
  if (tags.size === 0) return [];
  return all
    .filter((other) => other.id !== post.id && !exclude.has(other.id))
    .map((other) => ({
      other,
      score: other.data.tags.filter((tag) => tags.has(tag.toLowerCase())).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || byNewest(a.other, b.other))
    .slice(0, limit)
    .map(({ other }) => other);
}
