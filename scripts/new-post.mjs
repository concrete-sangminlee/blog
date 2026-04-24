#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

// import.meta.dirname replaces the old fileURLToPath + path.dirname
// pair and requires Node ≥ 20.11 / 21.2, which matches the floor we
// pin in package.json engines.
const CONTENT_DIR = path.join(import.meta.dirname, "..", "src", "content", "blog");

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getNowIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  // Local-time ISO without the timezone suffix; lets two posts drafted on
  // the same day still sort deterministically by minute.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const title = process.argv.slice(2).join(" ");

if (!title) {
  console.error("사용법: npm run new-post \"글 제목\"");
  process.exit(1);
}

const slug = slugify(title);
if (!slug) {
  console.error("슬러그로 변환할 글자(한글, 영문, 숫자)가 없습니다");
  process.exit(1);
}
const filename = `${slug}.mdx`;
const filepath = path.join(CONTENT_DIR, filename);

if (fs.existsSync(filepath)) {
  console.error(`이미 같은 파일이 있습니다: ${filepath}`);
  process.exit(1);
}

fs.mkdirSync(CONTENT_DIR, { recursive: true });

// Escape embedded quotes so titles like "'유레카' 순간" don't break YAML.
const yamlTitle = title.replace(/"/g, '\\"');
// Placeholder description is long enough to satisfy the content schema's
// min(16) on description, so running `npm run dev` right after scaffold
// doesn't throw a zod validation error. Author replaces it before publish.
const content = `---
title: "${yamlTitle}"
description: "여기에 한 줄 설명을 적어주세요."
pubDate: ${getNowIso()}
tags: []
draft: true
featured: false
math: false
---

여기에 글을 작성하세요.
`;

fs.writeFileSync(filepath, content, "utf-8");
console.log(`생성됨: src/content/blog/${filename}`);
console.log(`글을 작성한 뒤 frontmatter의 draft: false 로 바꿔 발행하세요.`);
