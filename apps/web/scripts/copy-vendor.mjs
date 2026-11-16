// Copies files that must be served as standalone URLs into public/ (all gitignored).
//
// 1. MapLibre's Web Worker: MapLibre resolves it relative to its own module URL,
//    which doesn't exist once bundled, so we serve it and call setWorkerUrl().
//    The version is in the filename so it can be cached forever.
// 2. The embeddable widget (/widget.js), built from packages/widget.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(appDir, "public");

const maplibrePkg = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(maplibrePkg, "utf8"));
mkdirSync(join(publicDir, "vendor"), { recursive: true });
copyFileSync(
  join(dirname(maplibrePkg), "dist", "maplibre-gl-worker.mjs"),
  join(publicDir, "vendor", `maplibre-gl-worker-${version}.mjs`),
);
console.log(`vendor: maplibre-gl-worker-${version}.mjs`);

// esbuild takes ~50 ms: always rebuild so `pnpm dev` never serves a stale widget.
const widgetDir = dirname(require.resolve("@retorno/widget/package.json"));
execFileSync("node", ["build.mjs"], { cwd: widgetDir, stdio: "inherit" });
copyFileSync(join(widgetDir, "dist", "retorno-widget.js"), join(publicDir, "widget.js"));
console.log("vendor: widget.js");
