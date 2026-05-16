const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Prefix an internal path with Astro's configured BASE_URL so links work
 * whether the site is deployed at `/`, `/blog/`, or any sub-path.
 *
 *   href("/")          -> "/blog/"
 *   href("/posts/")    -> "/blog/posts/"
 */
export function href(path: string): string {
  if (path === "/") return `${base}/`;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}
