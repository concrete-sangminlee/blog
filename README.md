# Sang Min Lee’s Blog

구조공학과 인공지능의 교차점에서, 연구와 대학원 생활을 기록하는 개인 블로그.

**https://concrete-sangminlee.github.io/blog/**

## Features

- **Curated reading paths** (`/start-here/`) — 포스트를 주제별 흐름으로 묶은 진입점
- **Tag index** (`/tags/`) — 카테고리별 탐색
- **Client-side search** — `⌘K` / `Ctrl+K`로 제목·내용 검색 (Pagefind)
- **RSS feed** (`/rss.xml`) — 피드 리더 구독
- **OG social cards** — 포스트마다 자동 생성되는 SVG 카드
- **Dark/Light theme** — 헤더의 수동 전환 버튼, 선택은 localStorage에 저장

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

# New post (creates a draft under src/content/blog/)
npm run new-post "글 제목"

# TypeScript typecheck (runs against astro/tsconfigs/strictest)
npm run typecheck

# Frontmatter + prose sanity check
npm run audit:blog -- --show-warnings=true

# Run all three above in sequence (typecheck → audit → build)
npm run check

# Build (includes Pagefind indexing)
npm run build

# Preview production build
npm run preview
```

## Deployment

Push to `main` triggers GitHub Actions → GitHub Pages automatically.
