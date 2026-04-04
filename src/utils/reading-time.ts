const WORDS_PER_MINUTE = 200;
const KOREAN_CHARS_PER_MINUTE = 500;

export function getReadingTime(content: string): string {
  const text = content
    .replace(/<[^>]*>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$]*\$/g, "")
    .trim();

  const koreanChars = (text.match(/[\u3131-\uD79D]/g) || []).length;
  const englishWords = text
    .replace(/[\u3131-\uD79D]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = Math.ceil(
    koreanChars / KOREAN_CHARS_PER_MINUTE +
      englishWords / WORDS_PER_MINUTE,
  );

  return `${Math.max(1, minutes)} min read`;
}
