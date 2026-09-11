import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { frontmatter as SITE } from "../data/home.md";

export async function GET(context) {
  const posts = await getCollection("blog");
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.slug}/`,
    })),
  });
}