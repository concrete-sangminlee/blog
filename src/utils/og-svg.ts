import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH } from "@/utils/social-image";

interface OgSvgOptions {
  title: string;
  description: string;
  eyebrow: string;
  footer: string;
  tags?: string[];
}

const palette = {
  background: "#fafaf8",
  text: "#171717",
  secondary: "#5f5a54",
  muted: "#8a837b",
  accent: "#c47a1a",
  line: "#e3dacf",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return char;
    }
  });
}

function visualLength(value: string): number {
  return Array.from(value).reduce((total, char) => {
    if (/\s/.test(char)) return total + 0.45;
    if (/[\x00-\x7F]/.test(char)) return total + 0.58;
    return total + 1;
  }, 0);
}

function chunkLongWord(word: string, maxUnits: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const char of Array.from(word)) {
    const candidate = current + char;
    if (current && visualLength(candidate) > maxUnits) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function wrapText(value: string, maxUnits: number, maxLines: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const rawWord of words) {
    const wordParts = visualLength(rawWord) > maxUnits
      ? chunkLongWord(rawWord, maxUnits)
      : [rawWord];

    for (const word of wordParts) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && visualLength(candidate) > maxUnits) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }

      if (lines.length === maxLines) break;
    }

    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    const last = lines[maxLines - 1];
    // Use the single-character Unicode ellipsis so the OG image shows one
    // properly-kerned glyph instead of three dots.
    if (last !== undefined) {
      lines[maxLines - 1] = visualLength(last) > maxUnits - 1.5
        ? `${last.slice(0, Math.max(0, last.length - 1)).trim()}…`
        : `${last}…`;
    }
  }

  return lines;
}

function renderTextLines(
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  className: string,
): string {
  return lines
    .map((line, index) => (
      `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`
    ))
    .join("");
}

function renderTags(tags: string[]): string {
  const visibleTags = tags.slice(0, 4);
  let x = 86;

  return visibleTags
    .map((tag) => {
      const width = Math.max(78, Math.min(168, visualLength(tag) * 16 + 34));
      const pill = `
        <g>
          <rect x="${x}" y="516" width="${width}" height="34" rx="17" fill="#fffaf2" stroke="${palette.line}" />
          <text x="${x + 17}" y="538" class="tag">${escapeXml(tag)}</text>
        </g>
      `;
      x += width + 12;
      return pill;
    })
    .join("");
}

export function renderOgSvg(options: OgSvgOptions): string {
  const titleLines = wrapText(options.title, 18.5, 2);
  const descriptionLines = wrapText(options.description, 39, 2);
  const titleY = titleLines.length === 1 ? 278 : 238;
  const descriptionY = titleLines.length === 1 ? 372 : 400;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SOCIAL_IMAGE_WIDTH}" height="${SOCIAL_IMAGE_HEIGHT}" viewBox="0 0 ${SOCIAL_IMAGE_WIDTH} ${SOCIAL_IMAGE_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .eyebrow { font: 700 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 1.4px; fill: ${palette.accent}; }
    .title { font: 800 64px -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; fill: ${palette.text}; }
    .description { font: 400 31px -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; fill: ${palette.secondary}; }
    .footer { font: 500 25px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${palette.muted}; }
    .tag { font: 600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; fill: ${palette.accent}; }
  </style>
  <rect width="${SOCIAL_IMAGE_WIDTH}" height="${SOCIAL_IMAGE_HEIGHT}" fill="${palette.background}" />
  <rect x="0" y="0" width="${SOCIAL_IMAGE_WIDTH}" height="18" fill="${palette.accent}" />
  <path d="M86 106H1114" stroke="${palette.line}" stroke-width="2" />
  <path d="M86 584H1114" stroke="${palette.line}" stroke-width="2" />
  <path d="M86 138V492" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round" />
  <text x="106" y="82" class="eyebrow">${escapeXml(options.eyebrow)}</text>
  ${renderTextLines(titleLines, 126, titleY, 78, "title")}
  ${renderTextLines(descriptionLines, 126, descriptionY, 43, "description")}
  ${renderTags(options.tags ?? [])}
  <text x="86" y="605" class="footer">${escapeXml(options.footer)}</text>
</svg>`;
}
