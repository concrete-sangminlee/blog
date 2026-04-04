export const SITE = {
  title: "Sang Min Lee",
  description: "AI 연구와 개발에 관한 이야기",
  author: "Sang Min Lee",
  url: "https://concrete-sangminlee.github.io",
  base: "/blog",
  lang: "ko-KR",
  postsPerPage: 8,
} as const;

export const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Posts", href: "/posts/" },
  { label: "Tags", href: "/tags/" },
  { label: "About", href: "/about/" },
] as const;

export const SOCIAL = {
  github: "https://github.com/concrete-sangminlee",
  email: "mailto:sangmin@snu.ac.kr",
  homepage: "https://concrete-sangminlee.github.io",
} as const;
