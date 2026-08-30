import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { readFileSync } from "node:fs";
import path from "node:path";

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