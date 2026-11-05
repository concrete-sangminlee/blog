import { maskCode } from "./post-rules.ts";

/**
 * Every external http(s) URL a post body links to or embeds: Markdown links
 * and images, reference definitions, <autolinks>, bare URLs, and href/src
 * attributes in MDX. Code blocks and inline code are ignored. Each URL is
 * returned once, with the 1-based line it first appears on.
 */
export function extractExternalLinks(body: string, lineOffset = 0): { url: string; line: number }[] {
  const { prose } = maskCode(body);
  const seen = new Map<string, number>();
  const patterns = [
    /\]\(\s*<?(https?:\/\/[^\s)>]+)/g, // [text](url) and ![alt](url)
    /^\s*\[[^\]]+\]:\s*<?(https?:\/\/\S+?)>?(?:\s|$)/gm, // [ref]: url
    /<(https?:\/\/[^>\s]+)>/g, // <https://…>
    /\b(?:href|src)=["'](https?:\/\/[^"']+)["']/g, // MDX/HTML attributes
    /(?<![("'<\[=])\b(https?:\/\/[^\s<>()"'`\]]+)/g, // bare URLs (GFM autolink)
  ];
  prose.split("\n").forEach((text, index) => {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const url = (match[1] ?? "").replace(/[.,;:!?]+$/, "");
        if (url && !seen.has(url)) seen.set(url, index + 1 + lineOffset);
      }
    }
  });
  return [...seen].map(([url, line]) => ({ url, line }));
}
