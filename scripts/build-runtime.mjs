// Bundles the Centixio site runtime (with three.js) into one classic script and
// copies GSAP into public/vendor so previews and exports can use them.
// Runs automatically before `dev` and `build`.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "vendor");
fs.mkdirSync(path.join(out, "gsap"), { recursive: true });

await build({
  entryPoints: [path.join(root, "src/runtime/entry.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  legalComments: "eof",
  outfile: path.join(out, "centixio-runtime.min.js"),
  logLevel: "warning",
});

const gsapDir = path.join(root, "node_modules", "gsap", "dist");
for (const f of ["gsap.min.js", "ScrollTrigger.min.js", "ScrollSmoother.min.js"]) {
  fs.copyFileSync(path.join(gsapDir, f), path.join(out, "gsap", f));
}

const threePkg = JSON.parse(fs.readFileSync(path.join(root, "node_modules/three/package.json"), "utf8"));
const gsapPkg = JSON.parse(fs.readFileSync(path.join(root, "node_modules/gsap/package.json"), "utf8"));
fs.writeFileSync(
  path.join(out, "THIRD_PARTY_NOTICES.txt"),
  [
    "Third-party software included in this website",
    "",
    `three.js ${threePkg.version} — MIT License — Copyright 2010-2026 Three.js Authors — https://threejs.org`,
    fs.readFileSync(path.join(root, "node_modules/three/LICENSE"), "utf8"),
    "",
    `GSAP ${gsapPkg.version} (gsap, ScrollTrigger, ScrollSmoother) — GSAP Standard "No Charge" License — https://gsap.com/standard-license`,
    "",
    `Lenis ${JSON.parse(fs.readFileSync(path.join(root, "node_modules/lenis/package.json"), "utf8")).version} (smooth scrolling, bundled into the runtime) — MIT License — https://github.com/darkroomengineering/lenis`,
    "",
    "Centixio site runtime and procedural 3D models — CC0-1.0 (public domain dedication).",
    "",
  ].join("\n"),
);
const kb = (f) => Math.round(fs.statSync(path.join(out, f)).size / 1024);
console.log(`runtime: ${kb("centixio-runtime.min.js")} KB, gsap: ${kb("gsap/gsap.min.js") + kb("gsap/ScrollTrigger.min.js") + kb("gsap/ScrollSmoother.min.js")} KB`);
