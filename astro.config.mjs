/**
 * astro.config.mjs — Astro project configuration.
 *
 * ── GitHub Pages ──────────────────────────────────────────────
 * User site (<user>.github.io) :  base: undefined,  site: "<url>"
 * Project site (<user>.github.io/<repo>/) :  base: "/<repo>",  site: "https://<user>.github.io"
 *
 * Example for https://z4d3s.github.io/bitacora/:
 *   site: "https://z4d3s.github.io"
 *   base: "/bitacora"
 *
 * If using a custom domain, set site to your domain and remove base.
 */

import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://example.com",
  // base: "/mi-repo",    ← descomentar si es project site
});
