import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = fileURLToPath(new URL("../public", import.meta.url));
const outDir = fileURLToPath(new URL("./dist", import.meta.url));
/** Generated art served from the repository's public/ folder (the legacy 1.x files there must not ship). */
const ASSET_DIRS: Record<string, { ext: string[]; type: Record<string, string> }> = {
  models: { ext: [".glb", ".json"], type: { ".glb": "model/gltf-binary", ".json": "application/json" } },
  ui: { ext: [".webp"], type: { ".webp": "image/webp" } },
};

/**
 * The generated models (Blender, art/build.py) and UI art (art/ui/build_ui.py) live in
 * public/models and public/ui. Serve them in dev and copy only them into the build.
 */
function assetsPlugin(): Plugin {
  return {
    name: "choice-of-life-assets",
    configureServer(server) {
      for (const [dir, info] of Object.entries(ASSET_DIRS)) {
        const base = path.join(publicRoot, dir);
        server.middlewares.use(`/${dir}`, (req, res) => {
          const notFound = () => {
            // A missing asset is a real 404, not Vite's index.html fallback, so broken art shows up in dev.
            res.statusCode = 404;
            res.end("Not found");
          };
          let file: string;
          try {
            file = path.join(base, decodeURIComponent((req.url ?? "").split("?")[0]));
          } catch {
            return notFound();
          }
          const relative = path.relative(base, file);
          const ext = path.extname(file);
          if (relative.startsWith("..") || path.isAbsolute(relative) || !info.ext.includes(ext) || !existsSync(file) || !statSync(file).isFile()) return notFound();
          res.setHeader("Content-Type", info.type[ext]);
          createReadStream(file).pipe(res);
        });
      }
    },
    closeBundle() {
      for (const [dir, info] of Object.entries(ASSET_DIRS)) {
        const target = path.join(outDir, dir);
        mkdirSync(target, { recursive: true });
        for (const f of readdirSync(path.join(publicRoot, dir))) {
          if (info.ext.includes(path.extname(f))) copyFileSync(path.join(publicRoot, dir, f), path.join(target, f));
        }
      }
      copyFileSync(path.join(publicRoot, "404.html"), path.join(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL("./static", import.meta.url)),
  base: "./",
  plugins: [assetsPlugin()],
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { three: ["three"] } },
    },
  },
  server: { port: 4410, strictPort: false },
  preview: { port: 4411 },
  test: {
    root,
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
