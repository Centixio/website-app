#!/usr/bin/env node
/**
 * Offline film renderer (scroll-world technique, self-rendered).
 *
 * Renders deterministic Three.js camera flights frame-by-frame in headless
 * Chromium on the GPU, pipes the frames into ffmpeg, and writes scrub-ready
 * clips + posters to public/films/<film>/.
 *
 *   node scripts/render-films.mjs --film world --aspect desktop
 *   node scripts/render-films.mjs --film world --aspect mobile
 *   node scripts/render-films.mjs --film nocturne --preview 0,60,120   # stills only, to review framing
 *
 * Encodes follow the scroll-world skill (references/pipeline.md):
 *   desktop  1920x1080, -crf 20 -g 8, light unsharp, faststart, no audio
 *   mobile   native 9:16 render, scaled to 720 wide, -crf 23 -g 4
 */
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : null)).filter(Boolean));
const filmId = args.film ?? "world";
const aspect = args.aspect ?? "desktop";
const fps = Number(args.fps ?? 30);
const only = args.only ? String(args.only).split(",") : null;
const preview = args.preview ? String(args.preview).split(",").map(Number) : null;
const portrait = aspect === "mobile";
const [W, H] = portrait ? [1080, 1920] : [1920, 1080];
const ss = Number(args.ss ?? 2);

const buildDir = path.join(root, "films", ".build");
fs.mkdirSync(buildDir, { recursive: true });
await build({ entryPoints: [path.join(root, "films/src/main.js")], bundle: true, format: "iife", outfile: path.join(buildDir, "film.js"), logLevel: "warning", target: "es2022" });
fs.writeFileSync(path.join(buildDir, "index.html"), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><script src="film.js"></script>`);

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const dir = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return path.join(cache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
}

const browser = await chromium.launch({ executablePath: chromePath(), args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("[page]", e.message));
page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
await page.goto(`file://${path.join(buildDir, "index.html")}`);
const segments = await page.evaluate((o) => window.FILM.setup(o), { id: filmId, width: W, height: H, portrait, supersample: ss });

const outDir = preview ? path.join(root, "films", ".preview", filmId) : path.join(root, "public", "films", filmId);
fs.mkdirSync(outDir, { recursive: true });
const suffix = portrait ? "-m" : "";

function ffmpeg(argsList) {
  const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argsList], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => p.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  return { stdin: p.stdin, done };
}

const write = (stream, buf) => new Promise((res) => (stream.write(buf) ? res() : stream.once("drain", res)));
const t0 = Date.now();
const manifest = [];
for (let si = 0; si < segments.length; si++) {
  const seg = segments[si];
  if (only && !only.includes(seg.name)) continue;
  const frames = Math.round(seg.seconds * fps);
  if (preview) {
    for (const fi of preview) {
      const f = Math.min(frames - 1, fi);
      const data = await page.evaluate(([s, i, n]) => window.FILM.frame(s, i, n), [si, f, frames]);
      fs.writeFileSync(path.join(outDir, `${seg.name}${suffix}-${String(f).padStart(4, "0")}.jpg`), Buffer.from(data.split(",")[1], "base64"));
    }
    console.log(`preview ${seg.name}${suffix}: frames ${preview.join(",")}`);
    continue;
  }
  const out = path.join(outDir, `${seg.name}${suffix}.mp4`);
  const vf = portrait ? "scale=720:-2:flags=lanczos,unsharp=5:5:0.6:5:5:0.0" : "unsharp=5:5:0.8:5:5:0.0";
  const enc = ffmpeg([
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-an", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", portrait ? "23" : "20", "-pix_fmt", "yuv420p",
    "-g", portrait ? "4" : "8", "-keyint_min", portrait ? "4" : "8", "-sc_threshold", "0", "-movflags", "+faststart", out,
  ]);
  let first = null;
  for (let fi = 0; fi < frames; fi++) {
    const data = await page.evaluate(([s, i, n]) => window.FILM.frame(s, i, n), [si, fi, frames]);
    const buf = Buffer.from(data.split(",")[1], "base64");
    if (fi === 0) first = buf;
    await write(enc.stdin, buf);
    if (fi % 30 === 0) process.stdout.write(`\r${seg.name}${suffix} ${fi}/${frames}   `);
  }
  enc.stdin.end();
  await enc.done;
  // Poster = the clip's actual first frame (so the poster→video handoff never flashes).
  const posterOut = path.join(outDir, `${seg.name}${suffix}.webp`);
  const pp = ffmpeg(["-f", "image2pipe", "-c:v", "mjpeg", "-i", "-", "-vf", portrait ? "scale=720:-2:flags=lanczos" : "scale=1600:-2:flags=lanczos", "-c:v", "libwebp", "-quality", "82", posterOut]);
  pp.stdin.end(first);
  await pp.done;
  const kb = Math.round(fs.statSync(out).size / 1024);
  manifest.push({ name: seg.name, seconds: seg.seconds, frames, kb });
  process.stdout.write(`\r${seg.name}${suffix}: ${frames} frames, ${kb} KB (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)\n`);
}
if (!preview) fs.writeFileSync(path.join(outDir, `manifest${suffix}.json`), JSON.stringify({ film: filmId, aspect, fps, width: portrait ? 720 : W, segments: manifest }, null, 2));
await browser.close();
