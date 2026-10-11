/**
 * Bundles netlify/functions-src/*.ts into netlify/functions/*.mjs (gitignored).
 * Runs after `next build` on Netlify (see netlify.toml). Uses the react-server
 * condition, like `npm run worker`, so "server-only" modules load outside Next.
 */
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";

const srcDir = "netlify/functions-src";
const outDir = "netlify/functions";
rmSync(outDir, { recursive: true, force: true });
const entries = readdirSync(srcDir).filter((f) => f.endsWith(".ts")).map((f) => `${srcDir}/${f}`);

await build({
  entryPoints: entries,
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  conditions: ["react-server"],
  external: ["sharp"],
  define: { __CX_SITE_URL__: JSON.stringify(process.env.URL ?? "") },
  // CommonJS dependencies inside an ESM bundle need require().
  banner: { js: "import { createRequire as __cxCreateRequire } from 'node:module'; const require = __cxCreateRequire(import.meta.url);" },
  logLevel: "info",
});
console.log(`Bundled ${entries.length} Netlify function(s) into ${outDir}/`);
