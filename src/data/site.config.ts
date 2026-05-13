export const SITE = {
  title: "Sang Min Lee’s Blog",
  description: "구조공학과 인공지능의 교차점에서, 연구와 대학원 생활을 기록합니다.",
  author: "Sang Min Lee",
  // Kept without a trailing slash so string templates like `${SITE.base}/foo`
  // don't produce `/blog//foo`. astro.config.ts intentionally keeps its own
  // `base: "/blog/"` because Astro's router expects trailing slashes there.
  base: "/blog",
  lang: "ko-KR",
} as const;

export const NAV_ITEMS = [
  { label: "홈", href: "/" },
  { label: "전체 글", href: "/posts/" },
  { label: "태그", href: "/tags/" },
  { label: "소개", href: "/about/" },
] as const;

export const SOCIAL = {
  github: "https://github.com/concrete-sangminlee",
  email: "mailto:sangmin@snu.ac.kr",
} as const;
