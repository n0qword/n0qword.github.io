import { defineConfig } from "astro/config";
import remarkYouTube from "./src/plugins/remark-youtube.mjs";

export default defineConfig({
  site: "https://blog.n0qword.com",
  markdown: {
    remarkPlugins: [remarkYouTube],
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      defaultColor: false,
    },
  },
});