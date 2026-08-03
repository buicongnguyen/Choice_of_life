import { defineConfig } from "vite";

// Relative base keeps every generated asset valid under the Choice of Life
// GitHub Pages project path as well as local previews.
export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    manifest: true,
  },
});
