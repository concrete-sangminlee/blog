import { getCollection, type CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;

export async function getAllPosts(): Promise<BlogPost[]> {
  try {
    const posts = await getCollection("blog", ({ data }) => {
      return import.meta.env.PROD ? !data.draft : true;
    });
    return posts.sort(
      (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
    );
  } catch {
    return [];
  }
}

export async function getFeaturedPosts(): Promise<BlogPost[]> {
  const posts = await getAllPosts();
  return posts.filter((post) => post.data.featured);
}

export async function getPostsByTag(tag: string): Promise<BlogPost[]> {
  const posts = await getAllPosts();
  return posts.filter((post) =>
    post.data.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase()),
  );
}

export async function getAllTags(): Promise<Map<string, number>> {
  const posts = await getAllPosts();
  const tags = new Map<string, number>();
  posts.forEach((post) => {
    post.data.tags.forEach((tag) => {
      const lower = tag.toLowerCase();
      tags.set(lower, (tags.get(lower) || 0) + 1);
    });
  });
  return new Map([...tags.entries()].sort((a, b) => b[1] - a[1]));
}

export function paginate<T>(items: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  const end = start + perPage;
  return {
    data: items.slice(start, end),
    total: items.length,
    totalPages: Math.ceil(items.length / perPage),
    currentPage: page,
    hasNext: end < items.length,
    hasPrev: page > 1,
  };
}
