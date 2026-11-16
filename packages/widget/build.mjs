// Bundles the widget into one self-registering, dependency-free script:
//   <script src="https://…/widget.js" defer></script>
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const outfile = "dist/retorno-widget.js";

await build({
  entryPoints: ["src/register.ts"],
  outfile,
  bundle: true,
  minify: true,
  format: "iife",
  // Safari 15 = iOS 15 (2021): needed for private class fields; older Safari also has a destructuring bug esbuild can't work around.
  target: ["es2020", "safari15"],
  define: { __WIDGET_VERSION__: JSON.stringify(version) },
  banner: {
    js: `/* <retorno-widget> v${version} · Unofficial concept by Neftalí Hernández, not affiliated with BeGo */`,
  },
  legalComments: "none",
});

const bytes = readFileSync(outfile);
console.log(
  `${outfile}: ${(bytes.length / 1024).toFixed(1)} KB (${(gzipSync(bytes).length / 1024).toFixed(1)} KB gzip)`,
);
