// Copies third-party files that must be served as standalone URLs into public/vendor.
//
// MapLibre resolves its Web Worker relative to its own module URL. Once bundled,
// that URL points into /_next/static/chunks where the worker doesn't exist, so
// we serve it ourselves and call setWorkerUrl(). The version is in the filename
// so browsers can cache it forever and never mix versions.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));

const outDir = join(appDir, "public", "vendor");
mkdirSync(outDir, { recursive: true });
copyFileSync(
  join(dirname(pkgPath), "dist", "maplibre-gl-worker.mjs"),
  join(outDir, `maplibre-gl-worker-${version}.mjs`),
);
console.log(`vendor: maplibre-gl-worker-${version}.mjs`);
