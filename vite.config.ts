import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type ViteDevServer, defineConfig } from "vite";

function resolveCommitHash() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT.slice(0, 7);

  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildCommit = resolveCommitHash();
const buildTime = process.env.BUILD_TIME ?? new Date().toISOString();

const webSocketServer = {
  name: "webSocketServer",
  async configureServer(server: ViteDevServer) {
    if (!server.httpServer) return;
    // Loaded lazily at runtime: the realtime server imports `bun:sqlite`,
    // which Node's default ESM loader (used by svelte-check) cannot resolve.
    // The URL is computed instead of using a string literal so Vite's config
    // bundler leaves the import alone and doesn't pull it into the top-level graph.
    const wsModuleUrl = pathToFileURL(join(process.cwd(), "src/ws/index.server.ts")).href;
    const { createWSServer } = await import(wsModuleUrl);
    const realtime = createWSServer(server.httpServer);
    server.httpServer.once("close", realtime.flush);
  }
};

// Serves the legacy stylesheet while developing. It is built from source (see
// scripts/build-legacy-css.ts) and rebuilt, with a short debounce, whenever
// files under src/ or scripts/legacy/ change.
const legacyCssDevServer = {
  name: "legacyCssDevServer",
  async configureServer(server: ViteDevServer) {
    const { buildLegacyCss } = await import("./scripts/build-legacy-css");
    let css = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const rebuild = async () => {
      try {
        css = await buildLegacyCss({ rootDir: process.cwd() });
      } catch (error) {
        console.error("[legacy-css] build failed:", error);
      }
    };

    await rebuild();
    server.watcher.on("all", (_event, file) => {
      if (!/[\\/](src|scripts[\\/]legacy)[\\/]/.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(rebuild, 300);
    });

    server.middlewares.use((req, res, next) => {
      if (!req.url || req.url.split("?")[0] !== "/legacy.css") return next();
      res.setHeader("Content-Type", "text/css");
      res.setHeader("Cache-Control", "no-cache");
      res.end(css);
    });
  }
};

export default defineConfig({
  plugins: [sveltekit(), tailwindcss(), webSocketServer, legacyCssDevServer],
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime)
  }
});
