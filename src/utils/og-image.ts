import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { loadOgFonts } from "@/utils/og-fonts";
import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH } from "@/utils/social-image";

/**
 * Social cards are laid out once with satori (flexbox → SVG with every
 * glyph converted to a path, so no fonts are needed to display it) and
 * then rasterised to PNG with resvg for platforms that reject SVG
 * og:images. The same SVG doubles as the crisp, lightweight thumbnail on
 * post cards, so the two can never drift apart.
 */

export interface SocialCardOptions {
  eyebrow: string;
  title: string;
  description: string;
  tags: readonly string[];
  footer: string;
}

// Mirrors the site's dark palette (src/styles/global.css).
const palette = {
  bg: "#08080a",
  surface: "#111114",
  text: "#e4e0d9",
  secondary: "#8b8680",
  muted: "#5c5955",
  accent: "#e8a849",
  border: "#232328",
};

type SatoriFont = Parameters<typeof satori>[1]["fonts"][number];
let fontsPromise: Promise<SatoriFont[]> | null = null;

function loadFonts(): Promise<SatoriFont[]> {
  fontsPromise ??= loadOgFonts().then((fonts) =>
    fonts.map(({ weight, data }) => ({
      name: "Pretendard",
      data,
      weight,
      style: "normal" as const,
    })),
  );
  return fontsPromise;
}

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: Node | string | (Node | string)[] };
};

const h = (
  type: string,
  style: Record<string, unknown>,
  children?: Node | string | (Node | string)[],
): Node => ({ type, props: { style, ...(children !== undefined && { children }) } });

/** Title size steps down for long titles so they stay within 3 lines. */
function titleSize(title: string): number {
  const units = Array.from(title).reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.55 : 1), 0);
  if (units <= 16) return 72;
  if (units <= 28) return 64;
  if (units <= 44) return 56;
  return 48;
}

function card(options: SocialCardOptions): Node {
  const tags = options.tags.slice(0, 4);
  return h(
    "div",
    {
      width: "100%",
      height: "100%",
      // satori defaults to content-box: without this the padding pushes the
      // footer row off the 1200×630 canvas.
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      backgroundColor: palette.bg,
      backgroundImage: `radial-gradient(ellipse 900px 420px at 50% -10%, rgba(232, 168, 73, 0.16), transparent 70%)`,
      fontFamily: "Pretendard",
      color: palette.text,
      paddingTop: 64,
      paddingRight: 80,
      paddingBottom: 56,
      paddingLeft: 80,
      position: "relative",
    },
    [
      h("div", { position: "absolute", top: 0, left: 0, right: 0, height: 10, backgroundColor: palette.accent }),
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: palette.accent,
        },
        [
          h("div", { width: 12, height: 12, borderRadius: 999, backgroundColor: palette.accent }),
          options.eyebrow,
        ],
      ),
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 0,
          justifyContent: "center",
          borderLeft: `6px solid ${palette.accent}`,
          paddingLeft: 36,
          marginTop: 28,
          marginBottom: 28,
        },
        [
          h(
            "div",
            {
              fontSize: titleSize(options.title),
              fontWeight: 700,
              lineHeight: 1.22,
              letterSpacing: -1.5,
              wordBreak: "keep-all",
              lineClamp: 3,
              display: "block",
            },
            options.title,
          ),
          h(
            "div",
            {
              marginTop: 22,
              fontSize: 30,
              fontWeight: 400,
              lineHeight: 1.5,
              color: palette.secondary,
              wordBreak: "keep-all",
              lineClamp: 2,
              display: "block",
            },
            options.description,
          ),
        ],
      ),
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          borderTop: `2px solid ${palette.border}`,
          paddingTop: 26,
        },
        [
          h(
            "div",
            { display: "flex", gap: 12 },
            tags.map((tag) =>
              h(
                "div",
                {
                  display: "flex",
                  padding: "6px 18px",
                  fontSize: 20,
                  fontWeight: 700,
                  color: palette.accent,
                  backgroundColor: "rgba(232, 168, 73, 0.08)",
                  border: "1.5px solid rgba(232, 168, 73, 0.28)",
                  borderRadius: 999,
                },
                tag,
              ),
            ),
          ),
          // flexShrink 0: long tags must not squeeze the date onto two lines.
          h("div", { display: "flex", flexShrink: 0, fontSize: 22, fontWeight: 400, color: palette.muted }, options.footer),
        ],
      ),
    ],
  );
}

const svgCache = new Map<string, Promise<string>>();

/** SVG with outlined text. Cached per options so .svg and .png share work. */
export function renderSocialCardSvg(options: SocialCardOptions): Promise<string> {
  const key = JSON.stringify(options);
  let svg = svgCache.get(key);
  if (!svg) {
    const missing = new Set<string>();
    svg = loadFonts()
      .then((fonts) =>
        satori(card(options) as Parameters<typeof satori>[0], {
          width: SOCIAL_IMAGE_WIDTH,
          height: SOCIAL_IMAGE_HEIGHT,
          fonts,
          // satori asks for a fallback whenever the card font lacks a glyph
          // (Hanja, emoji, symbols such as ∇). Those would render as boxes,
          // so record them and tell the author at build time.
          loadAdditionalAsset: async (_code: string, segment: string) => {
            missing.add(segment);
            return [];
          },
        }),
      )
      .then((result) => {
        if (missing.size > 0) {
          console.warn(
            `[social-card] "${options.title}": the card font has no glyphs for ${[...missing].map((s) => `"${s}"`).join(", ")}; they will show as boxes on the card and list thumbnail.`,
          );
        }
        return result;
      });
    svgCache.set(key, svg);
  }
  return svg;
}

export async function renderSocialCard(options: SocialCardOptions): Promise<Buffer> {
  const svg = await renderSocialCardSvg(options);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: SOCIAL_IMAGE_WIDTH },
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
