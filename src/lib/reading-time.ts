import { maskCode } from "./post-rules.ts";

const WORDS_PER_MINUTE = 200;
const HANGUL_CHARS_PER_MINUTE = 500;
/** Seconds a reader spends on a code block, on top of its prose. */
const SECONDS_PER_CODE_BLOCK = 12;

// U+AC00–U+D7A3 is the Hangul Syllables block; U+3131–U+318E covers
// Hangul Compatibility Jamo.
const HANGUL_RE = /[ㄱ-ㆎ가-힣]/g;

/**
 * Estimate reading time for a Markdown/MDX body in whole minutes (min 1).
 * Korean is counted per syllable, other scripts per word; code blocks add a
 * fixed skim cost instead of being read word-by-word; MDX imports, JSX
 * tags, URLs and math are ignored.
 */
export function getReadingMinutes(content: string): number {
  const codeBlocks = (content.match(/^ {0,3}(?:`{3,}|~{3,})/gm) ?? []).length / 2;
  const { prose } = maskCode(content);
  const text = prose
    .replace(/^(?:import|export)\s.*$/gm, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_~|-]+/g, " ");

  const hangul = (text.match(HANGUL_RE) ?? []).length;
  const words = text.replace(HANGUL_RE, " ").split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length;

  const minutes =
    hangul / HANGUL_CHARS_PER_MINUTE +
    words / WORDS_PER_MINUTE +
    (Math.floor(codeBlocks) * SECONDS_PER_CODE_BLOCK) / 60;
  return Math.max(1, Math.ceil(minutes));
}
