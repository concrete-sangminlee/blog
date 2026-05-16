# Sang Min Lee’s Blog

구조공학과 인공지능의 교차점에서, 연구와 대학원 생활을 기록하는 개인 블로그.

**https://concrete-sangminlee.github.io/blog/**

## Features

- **Curated reading paths** (`/start-here/`) — 검증된 포스트가 쌓이면 주제별 흐름으로 묶는 진입점
- **Tag index** (`/tags/`) — 카테고리별 탐색
- **Client-side search** — `⌘K` / `Ctrl+K`로 제목·내용 검색 (Pagefind)
- **OG social cards** — 포스트마다 자동 생성되는 SVG 카드
- **Dark-only theme** — 모든 페이지를 다크 테마로 고정
- **Publish gate** — `draft: false` 글은 `verified: true`가 있어야 감사와 타입체크를 통과

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

# Publish checklist
# 1. 사실·인용·개인 경험의 범위를 확인
# 2. frontmatter에 verified: true 설정
# 3. draft: false 설정

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

## Admin

브라우저에서 글을 새로 쓰거나 수정하려면 `/blog/admin/`으로 접속해 GitHub Personal Access Token(`repo` 권한)을 붙여넣으면 됩니다. 토큰은 브라우저 `localStorage`에만 저장되고, 저장·삭제는 GitHub API로 바로 커밋됩니다.
