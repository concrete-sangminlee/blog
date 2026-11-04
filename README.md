# Sang Min Lee’s Blog

구조공학과 인공지능의 교차점에서 기록을 남기는 개인 블로그.

**https://concrete-sangminlee.github.io/blog/**

## Features

- **PNG social cards**: 글마다 1200×630 카드를 자동 생성합니다. 카카오톡·X·페이스북·슬랙은 SVG `og:image`를 표시하지 않으므로 PNG로 굽고, 같은 레이아웃의 벡터(SVG) 판은 목록 썸네일로 씁니다.
- **Publish gate**: `draft: false` 글은 `verified: true`가 있어야 스키마·감사·admin 저장을 모두 통과합니다.
- **One rulebook**: 제목·설명 길이, slug, 날짜, 문체 감사 규칙이 `src/lib/post-rules.ts` 한 곳에 있고 콘텐츠 스키마, `audit:blog`, `new-post`, admin이 모두 이것을 씁니다.
- **Writing extras**: 섹션 고유 링크(`#`), 모바일 접이식 목차, 태그 기반 관련 글, 각주(한국어 라벨), 가로 스크롤 표, KaTeX(수식이 있는 글에서만 로드), 인쇄용 스타일, MDX 컴포넌트 `<Callout>`·`<Figure>`.
- **Dark-only theme**: 모든 페이지를 다크 테마로 고정합니다.

## Tech Stack

- [Astro 7](https://astro.build) + Content Layer (`glob` loader)
- [Tailwind CSS v4](https://tailwindcss.com)
- [MDX](https://mdxjs.com) / Markdown (`.md`, `.mdx` 모두 지원)
- [KaTeX](https://katex.org): 빌드에 쓴 버전의 CSS를 직접 호스팅
- [Expressive Code](https://expressive-code.com)
- [satori](https://github.com/vercel/satori) + [resvg](https://github.com/yisibl/resvg-js): 소셜 카드
- [Disqus](https://disqus.com): 댓글

## Usage

Node 22.23.4 이상이 필요합니다(`.nvmrc`는 24).

```bash
npm run dev                         # 개발 서버 (초안도 보임)
npm run dev:fixture                 # 테스트용 예시 글로 개발 서버
npm run new-post "글 제목"           # src/content/blog/에 초안 생성
npm run check                       # 커밋 전 전체 검사 (아래 참고)
npm run build && npm run preview    # 프로덕션 빌드 확인
```

### 발행 체크리스트

1. 사실·인용·개인 경험의 범위를 확인
2. frontmatter에 `verified: true` 설정
3. `draft: false` 설정

날짜는 시간대 오프셋까지 적습니다(`2026-11-04T21:00:00+09:00`). `new-post`와 admin은 자동으로 이렇게 씁니다. 오프셋이 없으면 YAML이 UTC로 읽어 저녁에 쓴 글이 다음 날로 표시될 수 있습니다.

### MDX 컴포넌트

`.mdx` 글에서는 import 없이 쓸 수 있습니다.

```mdx
<Callout type="warning" title="단위 주의">
하중은 kN/m, 길이는 m 기준이다.
</Callout>

<Figure src="/blog/images/beam.png" alt="단순보 처짐 곡선" caption="그림 1. 단순보 처짐" />
```

`type`은 `note`, `tip`, `warning`, `danger` 중 하나입니다. 이미지는 `public/images/`에 두고 `/blog/images/...`로 참조합니다(`/blog`를 빼면 감사에서 오류로 잡힙니다).

## Checks

| 명령 | 내용 |
| --- | --- |
| `npm run typecheck` | `astro check`: `.astro`와 `.ts` 전체를 strictest 설정으로 검사 |
| `npm run audit:blog` | 글 감사: frontmatter, 길이, 섹션 수, em dash, `#` 제목, 미래 날짜, `/blog` 빠진 링크, alt 없는 이미지, 닫히지 않은 코드 블록, slug 충돌 (`-- --show-warnings`로 경고까지) |
| `npm test` | 공유 모듈 단위 테스트 (Node 내장 테스트 러너) |
| `npm run build:fixture` | `tests/fixtures/blog`의 예시 글로 사이트를 `dist-fixture/`에 빌드 |
| `npm run check:dist` | 빌드 결과의 내부 링크·앵커, 메타데이터, JSON-LD, 소셜 카드 크기, sitemap 검사 |
| `npm run test:e2e` | 브라우저 테스트: admin(가짜 GitHub API), 예시 사이트(목차, 모바일, 페이지 전환) |
| `npm run check` | typecheck → 감사 → 단위 테스트 → 두 빌드 → 산출물 검사 |

실제 블로그가 비어 있어도 글 템플릿이 망가지지 않도록, CI는 항상 예시 글(fixture)로도 빌드하고 테스트합니다. 예시 글은 `tests/fixtures/`에만 있고 배포되지 않습니다.

## Deployment

`main`에 push하면 GitHub Actions가 CI(위 검사 전부 + 브라우저 테스트)를 돌리고, 통과한 경우에만 GitHub Pages로 배포합니다. Pull request에도 같은 CI가 돕니다. Dependabot이 매주 의존성 업데이트 PR을 묶어서 올립니다.

소셜 카드용 Pretendard TTF는 빌드 때 jsDelivr에서 받아 SHA-256으로 검증한 뒤 `node_modules/.cache/og-fonts/`에 캐시합니다. 오프라인에서 빌드하려면 `OG_FONT_DIR`에 같은 파일이 있는 폴더를 지정하세요.

## Admin

브라우저에서 `/blog/admin/`으로 접속해 GitHub 토큰을 넣으면 글을 쓰고 고칠 수 있습니다. 저장은 GitHub API로 `main`에 바로 커밋됩니다.

- **토큰**: [fine-grained token](https://github.com/settings/personal-access-tokens/new)을 이 저장소에만, `Contents: Read and write` 권한으로 만드는 것을 권장합니다. 기본은 탭을 닫으면 지워지는 `sessionStorage`이고, "기억하기"를 켜면 `localStorage`에 남습니다.
- **안전장치**: 저장 전에 CI와 같은 감사를 돌려 오류가 있으면 커밋하지 않습니다. 다른 곳에서 파일이 바뀌었으면 덮어쓰지 않고 알려 줍니다. 작성 중인 내용은 브라우저에 자동 저장됩니다. 알 수 없는 frontmatter 키는 그대로 보존합니다.
- **보안**: 페이지에 Content-Security-Policy를 걸어 스크립트는 같은 출처에서만, 네트워크 요청은 `api.github.com`으로만 가능합니다. 미리보기는 스크립트가 꺼진 sandbox iframe에서 렌더링되어 글 본문의 HTML이 토큰에 접근할 수 없습니다.

## Project layout

```
src/
  lib/          프레임워크 없는 공유 모듈 (사이트·스크립트·admin·테스트가 함께 사용)
    post-rules.ts   제한값, slug, 날짜, 감사 규칙
    frontmatter.ts  frontmatter 파싱/직렬화 (왕복 보존)
    markdown/       rehype 플러그인 (섹션 링크, 표 래퍼 등)
  admin/        /admin/ 페이지 스크립트 (GitHub 클라이언트, 편집기)
  components/   Astro 컴포넌트 (mdx/: 글에서 쓰는 컴포넌트)
  utils/        Astro 전용 헬퍼 (컬렉션, 소셜 카드 렌더러)
scripts/        audit, new-post, check-dist
tests/          unit/, e2e/, fixtures/blog/
```
