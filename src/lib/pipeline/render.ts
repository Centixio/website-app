import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { assembleSite, type VendorScripts } from "@/lib/assembler";
import type { DesignSpec } from "@/lib/spec/schema";
import type { Asset } from "@/lib/data/types";
import { slugify } from "@/lib/assembler/html";
import { googleFontsHref } from "@/lib/catalog/fonts";
import { LIMITS } from "@/config/limits";
import { brand } from "@/config/brand";
import { getFilm, type FilmDef } from "@/lib/catalog/films";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export function referencedFilms(spec: DesignSpec): FilmDef[] {
  const ids = new Set(spec.sections.filter((s) => s.type === "scroll-film" && s.filmId).map((s) => s.filmId!));
  return Array.from(ids)
    .map((id) => getFilm(id))
    .filter((f): f is FilmDef => Boolean(f));
}

function filmFiles(f: FilmDef): string[] {
  return [f.files.desktop, f.files.mobile, f.files.poster, f.files.posterMobile];
}

export function referencedAssetIds(spec: DesignSpec): string[] {
  const ids = new Set<string>();
  const add = (id?: string | null) => id && ids.add(id);
  add(spec.brand.logoAssetId);
  add(spec.assets.faviconAssetId);
  add(spec.assets.socialImageAssetId);
  if (spec.scene.enabled && spec.scene.source.type === "upload") add(spec.scene.source.assetId);
  for (const s of spec.sections) {
    s.imageAssetIds?.forEach(add);
    s.items?.forEach((i) => add(i.imageAssetId));
  }
  return Array.from(ids);
}

function zipPath(a: { id: string; name: string }): string {
  const ext = a.name.match(/\.([a-z0-9]{1,6})$/i)?.[1]?.toLowerCase() ?? "bin";
  return `assets/${slugify(a.name.replace(/\.[^.]+$/, ""), "asset")}-${a.id.slice(0, 8)}.${ext}`;
}

function modelUrlFor(spec: DesignSpec, resolve: (id: string) => string | null): string | null {
  return spec.scene.enabled && spec.scene.source.type === "upload" ? resolve(spec.scene.source.assetId) : null;
}

/** Canonical stored output: references assets and vendor files by relative path (as in the ZIP). */
export function renderPortable(spec: DesignSpec, assets: { id: string; name: string }[]): string {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const resolve = (id: string) => (byId.has(id) ? zipPath(byId.get(id)!) : null);
  return assembleSite(spec, { mode: "export-zip", assets: { url: resolve }, modelUrl: modelUrlFor(spec, resolve) });
}

export async function renderPreview(
  spec: DesignSpec,
  assets: Asset[],
  sign: (a: Asset) => Promise<string>,
  opts: { appOrigin: string; nonce: string; assetOrigins: string[] },
): Promise<string> {
  const ids = referencedAssetIds(spec);
  const urls = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const a = assets.find((x) => x.id === id);
      if (a) urls.set(id, await sign(a));
    }),
  );
  const resolve = (id: string) => urls.get(id) ?? null;
  return assembleSite(spec, { mode: "preview", assets: { url: resolve }, modelUrl: modelUrlFor(spec, resolve), appOrigin: opts.appOrigin, previewNonce: opts.nonce, assetOrigins: opts.assetOrigins });
}

const VENDOR_DIR = path.join(process.cwd(), "public", "vendor");
let vendorCache: VendorScripts | null = null;

export async function loadVendorScripts(): Promise<VendorScripts> {
  if (vendorCache) return vendorCache;
  const read = (f: string) => fs.readFile(path.join(VENDOR_DIR, f), "utf8");
  const [runtime, gsap, scrollTrigger, scrollSmoother] = await Promise.all([
    read("centixio-runtime.min.js"),
    read("gsap/gsap.min.js"),
    read("gsap/ScrollTrigger.min.js"),
    read("gsap/ScrollSmoother.min.js"),
  ]);
  vendorCache = { runtime, gsap, scrollTrigger, scrollSmoother };
  return vendorCache;
}

export interface ExportResult {
  filename: string;
  contentType: string;
  body: Uint8Array;
}

/** Self-contained HTML: scripts and assets inlined (fonts stay remote, with system fallbacks). */
export async function exportSingleFile(spec: DesignSpec, assets: Asset[], readAsset: (a: Asset) => Promise<Uint8Array>): Promise<ExportResult & { notes: string[] }> {
  const ids = referencedAssetIds(spec);
  const used = assets.filter((a) => ids.includes(a.id));
  const total = used.reduce((n, a) => n + a.sizeBytes, 0);
  if (total > LIMITS.singleFileInlineMaxBytes) {
    throw new Error(`Assets total ${(total / 1048576).toFixed(1)} MB, which is too large to inline into one HTML file. Use the ZIP export instead.`);
  }
  const films = referencedFilms(spec);
  const filmBytes = films.reduce((n, f) => n + f.approxBytes, 0);
  if (total + filmBytes > LIMITS.singleFileInlineMaxBytes) {
    throw new Error("This site includes a scroll film, which is too large to inline into one HTML file. Use the ZIP export instead.");
  }
  const dataUris = new Map<string, string>();
  for (const a of used) dataUris.set(a.id, `data:${a.mimeType};base64,${Buffer.from(await readAsset(a)).toString("base64")}`);
  const inlineFilms: Record<string, string> = {};
  for (const f of films) {
    for (const file of filmFiles(f)) {
      const mime = file.endsWith(".mp4") ? "video/mp4" : "image/webp";
      inlineFilms[file] = `data:${mime};base64,${(await fs.readFile(path.join(PUBLIC_DIR, file))).toString("base64")}`;
    }
  }
  const resolve = (id: string) => dataUris.get(id) ?? null;
  const html = assembleSite(spec, { mode: "export-single", assets: { url: resolve }, modelUrl: modelUrlFor(spec, resolve), inlineScripts: await loadVendorScripts(), inlineFilms });
  return {
    filename: `${slugify(spec.brand.name, "site")}.html`,
    contentType: "text/html; charset=utf-8",
    body: new TextEncoder().encode(html),
    notes: ["Runs offline: scripts, 3D runtime and your assets are embedded.", `Fonts load from Google Fonts when online; offline, the system fallback fonts are used.`],
  };
}

export async function exportZip(spec: DesignSpec, assets: Asset[], readAsset: (a: Asset) => Promise<Uint8Array>): Promise<ExportResult> {
  const zip = new JSZip();
  const root = slugify(spec.brand.name, "site");
  const folder = zip.folder(root)!;
  folder.file("index.html", renderPortable(spec, assets));
  const ids = referencedAssetIds(spec);
  for (const a of assets.filter((x) => ids.includes(x.id))) folder.file(zipPath(a), await readAsset(a));
  const vendorFiles = ["centixio-runtime.min.js", "gsap/gsap.min.js", "gsap/ScrollTrigger.min.js", "gsap/ScrollSmoother.min.js"];
  for (const f of vendorFiles) folder.file(`vendor/${f}`, await fs.readFile(path.join(VENDOR_DIR, f)));
  for (const f of referencedFilms(spec)) for (const file of filmFiles(f)) folder.file(file, await fs.readFile(path.join(PUBLIC_DIR, file)));
  folder.file("THIRD_PARTY_NOTICES.txt", await fs.readFile(path.join(VENDOR_DIR, "THIRD_PARTY_NOTICES.txt")));
  folder.file("README.md", readme(spec));
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { filename: `${root}.zip`, contentType: "application/zip", body };
}

function readme(spec: DesignSpec): string {
  const contact = spec.integrations.formEndpoint
    ? `The contact form posts to \`${spec.integrations.formEndpoint}\`. Make sure that endpoint accepts \`name\`, \`email\` and \`message\` fields.`
    : spec.integrations.contactEmail
      ? `The contact section uses an email link (\`${spec.integrations.contactEmail}\`). To use a form instead, set a form endpoint (for example Formspree or your own API) in the Output settings and export again.`
      : "There is no contact form. Buttons link to your call-to-action URL.";
  return `# ${spec.brand.name}

Static website exported from ${brand.name}.

## Run it locally

Because the site loads JavaScript files and (optionally) a 3D model, open it through a local web server rather than double-clicking \`index.html\`:

\`\`\`bash
npx serve .
# or
python3 -m http.server 8080
\`\`\`

Then visit the printed URL.

## Host it

Upload this folder to any static host — Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 + CloudFront, or your own server. No build step and no server code are needed.

## What runs where

- **Offline-capable:** the 3D runtime (three.js), GSAP animation libraries and your assets are included in \`vendor/\` and \`assets/\`. Scroll films (pre-rendered video scrubbed by scroll) live in \`films/\`; the real-time 3D scenes render live in the browser.
- **Remote dependency:** fonts load from Google Fonts (\`${googleFontsHref([spec.typography.display, spec.typography.body]).slice(0, 80)}…\`). Without a connection the site falls back to system fonts.
- **No backend:** this is a static site. ${contact}
- Any pricing cards are informational and link to your call-to-action; they do not process payments.

## Accessibility and performance

- Respects \`prefers-reduced-motion\`: animations and 3D motion are disabled for visitors who ask for less motion.
- Without WebGL, 3D areas show a static fallback.
- On phones, 3D runs in "${spec.scene.mobile}" mode and effects are reduced.

## Social sharing

${spec.assets.socialImageAssetId ? "The `og:image` tag uses a relative path. Some platforms require an absolute URL; after deploying, change it to `https://your-domain/…`." : "No social image was set. Add one in the Output settings for nicer link previews."}

## Licenses

See \`THIRD_PARTY_NOTICES.txt\`. Centixio's runtime and procedural 3D models are CC0. Your uploaded assets remain yours.
`;
}
