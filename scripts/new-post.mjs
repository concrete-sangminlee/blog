#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "..", "src", "content", "blog");

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
  console.error("Usage: npm run new-post \"Post Title Here\"");
  process.exit(1);
}

const slug = slugify(title);
const filename = `${slug}.mdx`;
const filepath = path.join(CONTENT_DIR, filename);

if (fs.existsSync(filepath)) {
  console.error(`File already exists: ${filepath}`);
  process.exit(1);
}

fs.mkdirSync(CONTENT_DIR, { recursive: true });

const content = `---
title: "${title}"
description: ""
pubDate: ${getNowIso()}
tags: []
draft: true
featured: false
math: false
---

Write your post here.
`;

fs.writeFileSync(filepath, content, "utf-8");
console.log(`Created: src/content/blog/${filename}`);
console.log(`Edit the file and set draft: false when ready to publish.`);
