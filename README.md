# Sang Min Lee's Blog

구조공학과 인공지능의 교차점에서, 연구와 대학원 생활을 기록하는 개인 블로그.

**https://concrete-sangminlee.github.io/blog/**

## Features

- **Curated reading paths** (`/start-here/`) — 48개 포스트를 주제별 흐름으로 묶은 진입점
- **Tag index** (`/tags/`) — 카테고리별 탐색
- **Client-side search** — `⌘K` / `Ctrl+K`로 제목·내용 검색 (Pagefind)
- **RSS feed** (`/rss.xml`) — 피드 리더 구독
- **OG social cards** — 포스트마다 자동 생성되는 SVG 카드
- **Dark/Light theme** — 시스템 설정과 연동, 수동 전환 가능

## Tech Stack

- [Astro](https://astro.build) — Static site framework
- [Tailwind CSS v4](https://tailwindcss.com) — Styling
- [MDX](https://mdxjs.com) — Content (Markdown + Components)
- [KaTeX](https://katex.org) — LaTeX math rendering
- [Expressive Code](https://expressive-code.com) — Syntax highlighting
- [Pagefind](https://pagefind.app) — Static search
- [Disqus](https://disqus.com) — Comments

## Usage

```bash
# Development
npm run dev

# New post
npm run new-post "Post Title"

# Build
npm run build

# Preview production build
npm run preview
```

## Deployment

Push to `main` triggers GitHub Actions → GitHub Pages automatically.
