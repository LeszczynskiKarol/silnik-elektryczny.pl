import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    react(),
    tailwind(),
    sitemap({
      filter: (page) =>
        !page.includes("/checkout") && !page.includes("/zamowienie/"),
      serialize(item) {
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
  ],
  site: "https://www.silnik-elektryczny.pl",
});
