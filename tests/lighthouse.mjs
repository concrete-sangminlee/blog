#!/usr/bin/env node
/**
 * Lighthouse gate (mobile, simulated throttling) on the fixture build.
 *
 * Locks in what was measured when the site was tuned: accessibility,
 * best practices and SEO must stay at 100, performance above a floor that
 * leaves room for CI-runner noise. Each page runs three times and the
 * median score counts. Reports land in lighthouse-reports/.
 *
 *   npm run build:fixture && npm run test:lighthouse
 *
 * Lighthouse is fetched with npx (pinned) instead of being a dependency:
 * it is ~60 MB and only this check needs it.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { serveDist } from "./e2e/helpers.mjs";

const LIGHTHOUSE = "lighthouse@13.6.0";
const RUNS = Number(process.env["LIGHTHOUSE_RUNS"] ?? 3);
const DIST = process.env["DIST_DIR"] ?? "dist-fixture";
const OUT = path.resolve("lighthouse-reports");
const PAGES = [
  ["home", "/blog/"],
  ["post", "/blog/structural-analysis-notes/"],
  ["list", "/blog/posts/"],
];
const MIN = { performance: 0.85, accessibility: 1, "best-practices": 1, seo: 1 };

const run = promisify(execFile);
const chromePath = process.env["CHROMIUM_PATH"] ?? chromium.executablePath();
await mkdir(OUT, { recursive: true });
const server = await serveDist(DIST);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const failures = [];

try {
  for (const [name, pathname] of PAGES) {
    const scores = Object.fromEntries(Object.keys(MIN).map((key) => [key, []]));
    const vitals = [];
    for (let i = 1; i <= RUNS; i++) {
      const report = path.join(OUT, `${name}-${i}.json`);
      await run(
        "npx",
        [
          "--yes",
          LIGHTHOUSE,
          `${server.origin}${pathname}`,
          "--quiet",
          "--output=json",
          `--output-path=${report}`,
          `--only-categories=${Object.keys(MIN).join(",")}`,
          "--chrome-flags=--headless=new --no-sandbox",
        ],
        { env: { ...process.env, CHROME_PATH: chromePath }, maxBuffer: 64 * 1024 * 1024 },
      );
      const result = JSON.parse(await readFile(report, "utf8"));
      for (const key of Object.keys(MIN)) scores[key].push(result.categories[key]?.score ?? 0);
      const a = result.audits;
      vitals.push(`LCP ${a["largest-contentful-paint"].displayValue}, CLS ${a["cumulative-layout-shift"].displayValue}, TBT ${a["total-blocking-time"].displayValue}`);
    }
    const summary = Object.entries(scores).map(([key, values]) => {
      const score = median(values);
      if (score < MIN[key]) failures.push(`${pathname}: ${key} ${Math.round(score * 100)} < ${Math.round(MIN[key] * 100)}`);
      return `${key} ${Math.round(score * 100)}`;
    });
    console.log(`${pathname.padEnd(36)} ${summary.join(" · ")}  (${vitals[0]})`);
  }
} finally {
  await server.close();
}

if (failures.length) {
  console.error(`\nLighthouse gate failed:\n${failures.join("\n")}\nReports: ${path.relative(process.cwd(), OUT)}/`);
  process.exit(1);
}
console.log("Lighthouse gate passed.");
