import { defineCollection, z } from "astro:content";

const blogSchema = z
  .object({
    // Minimums mirror scripts/blog-quality-audit.mjs so Astro's content
    // sync already rejects too-short title/description before the audit
    // script runs in CI.
    // Caps are generous; real posts are far below them. They mostly guard
    // against an accidental giant title pasted into the admin.
    title: z.string().min(6).max(100),
    description: z.string().min(16).max(200),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // OG images only render the first 4 tags; capping at 5 leaves a tiny
    // buffer while preventing accidental 10+ tag posts.
    tags: z.array(z.string().min(1)).max(5).default([]),
    draft: z.boolean().default(false),
    // A post may be drafted freely, but publishing requires the author to
    // explicitly mark the facts and personal claims as verified.
    verified: z.boolean().default(false),
    featured: z.boolean().default(false),
    image: z
      .object({
        url: z.string().min(1),
        // Alt text is required if an image is attached — decorative images
        // shouldn't use this field at all (they belong in the prose markup
        // with alt="" / aria-hidden).
        alt: z.string().min(1),
      })
      .optional(),
    math: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.draft && !data.verified) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verified"],
        message: "Published posts must set verified: true.",
      });
    }
  });

const blog = defineCollection({
  type: "content",
  schema: blogSchema,
});

export const collections = { blog };
