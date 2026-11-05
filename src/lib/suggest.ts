/**
 * "Did you mean…?" for the 404 page: find the post whose slug is closest
 * to the URL that wasn't found (a typo, a renamed slug, a truncated link).
 * Framework-free so it is bundled into the page and unit-tested in Node.
 */

export interface PostRef {
  id: string;
  title: string;
}

/** Levenshtein distance over Unicode code points. */
export function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = row;
  }
  return prev[y.length] ?? 0;
}

const normalize = (value: string) => value.normalize("NFC").toLowerCase().replace(/[\s_]+/g, "-");

/** The slug a reader was looking for, from a pathname like /blog/foo/. */
export function requestedSlug(pathname: string, base: string): string {
  let rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  rest = rest.replace(/\/index\.html?$/, "").replace(/\.html?$/, "");
  const segments = rest.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  try {
    return normalize(decodeURIComponent(last));
  } catch {
    return normalize(last);
  }
}

/**
 * Best match with a similarity of at least `threshold` (0..1), else null.
 * A slug that contains, or is contained in, the request counts as close.
 */
export function closestPost(wanted: string, posts: readonly PostRef[], threshold = 0.5): PostRef | null {
  if (!wanted) return null;
  let best: { post: PostRef; score: number } | null = null;
  for (const post of posts) {
    const id = normalize(post.id);
    const length = Math.max(Array.from(id).length, Array.from(wanted).length);
    let score = 1 - editDistance(id, wanted) / length;
    if (wanted.length >= 4 && (id.includes(wanted) || wanted.includes(id))) score = Math.max(score, 0.8);
    if (!best || score > best.score) best = { post, score };
  }
  return best && best.score >= threshold ? best.post : null;
}
