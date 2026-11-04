import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { POST_LIMITS } from "./lib/post-rules.ts";

/**
 * Where posts live. CI points this at `tests/fixtures/blog` to build a
 * site full of representative content, so the post template, social
 * cards and link checks are exercised even while the real blog is empty.
 */
const CONTENT_DIR = process.env["BLOG_CONTENT_DIR"] ?? "./src/content/blog";

const blogSchema = z
  .object({
    // Limits live in src/lib/post-rules.ts so the schema, the audit
    // script, new-post and the admin all enforce the same numbers.
    title: z.string().trim().min(POST_LIMITS.title.min).max(POST_LIMITS.title.max),
    description: z
      .string()
      .trim()
      .min(POST_LIMITS.description.min)
      .max(POST_LIMITS.description.max),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string().trim().min(1)).max(POST_LIMITS.tags.max).default([]),
    draft: z.boolean().default(false),
    // A post may be drafted freely, but publishing requires the author to
    // explicitly mark the facts and personal claims as verified.
    verified: z.boolean().default(false),
    featured: z.boolean().default(false),
    image: z
      .object({
        url: z.string().min(1),
        // Alt text is required if an image is attached. Decorative images
        // belong in the prose markup with alt="" instead.
        alt: z.string().min(1),
      })
      .optional(),
    math: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.draft && !data.verified) {
      ctx.addIssue({
        code: "custom",
        path: ["verified"],
        message: "Published posts must set verified: true.",
      });
    }
    if (data.updatedDate && data.updatedDate < data.pubDate) {
      ctx.addIssue({
        code: "custom",
        path: ["updatedDate"],
        message: "updatedDate cannot be earlier than pubDate.",
      });
    }
    const lowered = data.tags.map((tag) => tag.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      ctx.addIssue({
        code: "custom",
        path: ["tags"],
        message: "Tags must be unique (case-insensitive).",
      });
    }
  });

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: CONTENT_DIR }),
  schema: blogSchema,
});

export const collections = { blog };
