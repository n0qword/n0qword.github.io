/**
 * src/content/config.ts — Astro Content Collections configuration.
 *
 * Defines the schema for the "blog" collection. Every markdown file
 * under src/content/blog/ is validated against this schema at build
 * time and provides type-safe access in .astro frontmatter.
 *
 * Fields:
 *   title       — Post title (string)
 *   description — Short excerpt shown in list views (string)
 *   pubDate     — Publication date, used for reverse-chronological sort (Date)
 *   tags        — Optional array of category/keyword strings for filtering
 */

import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };
