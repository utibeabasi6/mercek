import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// Static-first, fully prerendered. Canonical host (§11) — 301 the other to it.
export default defineConfig({
  site: "https://mercek.dev",
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
});
