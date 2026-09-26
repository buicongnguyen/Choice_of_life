import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const models = fileURLToPath(new URL("../public/models", import.meta.url));
const outDir = fileURLToPath(new URL("./dist", import.meta.url));

/**
 * The generated models live in the repository's public/models folder (next to the legacy
 * 1.x files, which must not ship). Serve them in dev and copy only them into the build.
 */
function modelsPlugin(): Plugin {
  return {
    name: "choice-of-life-models",
    configureServer(server) {
      server.middlewares.use("/models", (req, res, next) => {
        const file = path.join(models, decodeURIComponent((req.url ?? "").split("?")[0]));
        const relative = path.relative(models, file);
        if (relative.startsWith("..") || path.isAbsolute(relative) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "model/gltf-binary");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const target = path.join(outDir, "models");
      mkdirSync(target, { recursive: true });
      for (const f of readdirSync(models)) if (f.endsWith(".glb") || f === "manifest.json") copyFileSync(path.join(models, f), path.join(target, f));
      copyFileSync(fileURLToPath(new URL("../public/404.html", import.meta.url)), path.join(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL("./static", import.meta.url)),
  base: "./",
  plugins: [modelsPlugin()],
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
