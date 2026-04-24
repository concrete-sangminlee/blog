const WORDS_PER_MINUTE = 200;
const KOREAN_CHARS_PER_MINUTE = 500;

// U+AC00–U+D7A3 is the full Hangul Syllables block; U+3131–U+318E
// covers Hangul Compatibility Jamo. Combining both captures every
// syllable a Korean blog post can realistically contain.
const HANGUL_RE = /[ㄱ-ㆎ가-힣]/g;

export function getReadingMinutes(content: string): number {
  const text = content
    .replace(/<[^>]*>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$]*\$/g, "")
    .trim();

  const koreanChars = (text.match(HANGUL_RE) || []).length;
  const englishWords = text
    .replace(HANGUL_RE, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = Math.ceil(
    koreanChars / KOREAN_CHARS_PER_MINUTE +
      englishWords / WORDS_PER_MINUTE,
  );

  return Math.max(1, minutes);
}
