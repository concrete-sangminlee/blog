import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    // Minimums mirror scripts/blog-quality-audit.mjs so Astro's content
    // sync already rejects too-short title/description before the audit
    // script runs in CI.
    title: z.string().min(6),
    description: z.string().min(16),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    image: z
      .object({
        url: z.string(),
        alt: z.string(),
      })
      .optional(),
    math: z.boolean().default(false),
  }),
});

export const collections = { blog };
