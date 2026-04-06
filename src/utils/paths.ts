const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function href(path: string): string {
  if (path === "/") return `${base}/`;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}
