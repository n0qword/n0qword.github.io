/**
 * src/pages/rss.xml.js — RSS feed endpoint.
 *
 * Generates an RSS 2.0 feed at /rss.xml containing all blog posts
 * in reverse-chronological order. Site metadata (name, description)
 * is read from src/data/home.md by manually parsing its YAML frontmatter
 * at build time (JS endpoints cannot use Astro.glob).
 */

import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { readFileSync } from "node:fs";
import path from "node:path";

// Parse frontmatter from home.md (simple regex, no YAML lib needed)
const homePath = path.resolve(process.cwd(), "src/data/home.md");
const raw = readFileSync(homePath, "utf-8");
const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
const fields = Object.fromEntries(
  frontmatter.split("\n").map((l) => {
    const m = l.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    return m ? [m[1], m[2].replace(/^"|"$/g, "")] : [];
  }).filter((a) => a.length > 0)
);

export async function GET(context) {
  const posts = await getCollection("blog");
  return rss({
    title: fields.name,
    description: fields.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.slug}/`,
    })),
  });
}
