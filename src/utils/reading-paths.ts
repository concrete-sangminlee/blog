import { READING_PATHS, type ReadingPathDefinition } from "@/data/reading-paths";
import { getAllPosts, type BlogPost } from "@/utils/posts";

export interface ResolvedReadingPath extends ReadingPathDefinition {
  posts: BlogPost[];
}

function resolvePathPosts(
  definition: ReadingPathDefinition,
  postsBySlug: Map<string, BlogPost>,
): BlogPost[] {
  return definition.slugs.map((slug) => {
    const post = postsBySlug.get(slug);
    if (!post) {
      throw new Error(`Reading path "${definition.id}" references missing post "${slug}"`);
    }
    return post;
  });
}

export async function getReadingPaths(): Promise<ResolvedReadingPath[]> {
  const posts = await getAllPosts();
  const postsBySlug = new Map(posts.map((post) => [post.slug, post]));

  return READING_PATHS.map((definition) => ({
    ...definition,
    posts: resolvePathPosts(definition, postsBySlug),
  }));
}

export async function getFeaturedReadingPaths(): Promise<ResolvedReadingPath[]> {
  const paths = await getReadingPaths();
  return paths.filter((path) => path.featured);
}

export async function getReadingPathsForPost(slug: string): Promise<ResolvedReadingPath[]> {
  const paths = await getReadingPaths();
  return paths.filter((path) => path.posts.some((post) => post.slug === slug));
}

export function getReadingPathNeighbors(path: ResolvedReadingPath, slug: string): {
  index: number;
  prev: BlogPost | null;
  next: BlogPost | null;
} {
  const index = path.posts.findIndex((post) => post.slug === slug);
  if (index < 0) {
    return { index: -1, prev: null, next: null };
  }

  return {
    index,
    prev: index > 0 ? (path.posts[index - 1] ?? null) : null,
    next: index < path.posts.length - 1 ? (path.posts[index + 1] ?? null) : null,
  };
}

export function getReadingPathStats(paths: readonly ResolvedReadingPath[]): {
  pathCount: number;
  coveredPostCount: number;
} {
  const coveredPosts = new Set(paths.flatMap((path) => path.posts.map((post) => post.slug)));
  return {
    pathCount: paths.length,
    coveredPostCount: coveredPosts.size,
  };
}
