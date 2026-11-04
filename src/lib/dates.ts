/**
 * Every date on the site is shown in the author's time zone, regardless of
 * the machine that builds it (CI runs in UTC, the author writes in KST).
 */
export const SITE_TIME_ZONE = "Asia/Seoul";

const LONG = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: SITE_TIME_ZONE,
});

const SHORT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: SITE_TIME_ZONE,
});

/** `2026년 11월 4일` */
export function formatDateLong(date: Date): string {
  return LONG.format(date);
}

/** Card date. In ko-KR, short and long month names render the same. */
export function formatDateShort(date: Date): string {
  return SHORT.format(date);
}
