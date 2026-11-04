#!/usr/bin/env node
/**
 * Scaffold a draft post: npm run new-post "글 제목"
 * Shares slug, date and frontmatter rules with the admin and the audit.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serializePost } from "../src/lib/frontmatter.ts";
import { POST_LIMITS, slugify, toOffsetIsoString } from "../src/lib/post-rules.ts";

const CONTENT_DIR = path.join(import.meta.dirname, "..", "src", "content", "blog");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const title = process.argv.slice(2).join(" ").trim();
if (!title) fail('사용법: npm run new-post "글 제목"');
if (title.length < POST_LIMITS.title.min) fail(`제목은 ${POST_LIMITS.title.min}자 이상이어야 합니다`);
if (title.length > POST_LIMITS.title.max) fail(`제목은 ${POST_LIMITS.title.max}자 이하로 줄여주세요`);

const slug = slugify(title);
if (!slug) fail("슬러그로 변환할 글자(한글, 영문, 숫자)가 없습니다");

const filepath = path.join(CONTENT_DIR, `${slug}.mdx`);
if (existsSync(filepath)) fail(`이미 같은 파일이 있습니다: ${path.relative(process.cwd(), filepath)}`);

mkdirSync(CONTENT_DIR, { recursive: true });
writeFileSync(
  filepath,
  serializePost(
    {
      title,
      // Long enough for the schema's minimum so `npm run dev` works right
      // away; replace it before publishing.
      description: "여기에 한 줄 설명을 적어주세요.",
      pubDate: toOffsetIsoString(),
      tags: [],
      draft: true,
      verified: false,
      featured: false,
      math: false,
    },
    "여기에 글을 작성하세요.",
  ),
  "utf8",
);

console.log(`생성됨: ${path.relative(process.cwd(), filepath)}`);
console.log("발행하려면 사실 확인 후 verified: true 와 draft: false 를 함께 설정하세요.");
