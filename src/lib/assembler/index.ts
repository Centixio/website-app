import type { DesignSpec } from "@/lib/spec/schema";
import { getModel } from "@/lib/catalog/models";
import { googleFontsHref } from "@/lib/catalog/fonts";
import { buildStyles } from "./styles";
import { renderSection, stage, type AssetResolver, type RenderContext } from "./sections";
import { esc, jsonForScript, safeUrl } from "./html";

export type AssemblyMode = "preview" | "export-single" | "export-zip";

export interface VendorScripts {
  runtime: string;
  gsap: string;
  scrollTrigger: string;
  scrollSmoother: string;
}

export interface AssembleOptions {
  mode: AssemblyMode;
  assets: AssetResolver;
  /** URL for an uploaded GLB model, resolved for this mode. */
  modelUrl: string | null;
  /** Absolute origin serving /vendor in preview mode. */
  appOrigin?: string;
  /** Random per-render token so the parent can authenticate bridge messages. */
  previewNonce?: string;
  /** Origins the preview may load images/models from (CSP). */
  assetOrigins?: string[];
  /** Script sources to inline for single-file exports. */
  inlineScripts?: VendorScripts;
  /** Prefix for vendor script paths in export-zip mode (default: relative). */
  scriptBase?: string;
  /** Film files inlined as data URIs (single-file export), keyed by relative path. */
  inlineFilms?: Record<string, string>;
}

const NAV_LABELS: Record<string, string> = {
  "object-showcase": "Details",
  "pinned-story": "Story",
  "exploded-view": "Anatomy",
  features: "Features",
  gallery: "Gallery",
  "horizontal-cases": "Work",
  "abstract-scene": "Explore",
  specs: "Details",
  pricing: "Pricing",
  faq: "FAQ",
  contact: "Contact",
};

const SCRIPT_FILES = {
  gsap: "vendor/gsap/gsap.min.js",
  scrollTrigger: "vendor/gsap/ScrollTrigger.min.js",
  scrollSmoother: "vendor/gsap/ScrollSmoother.min.js",
  runtime: "vendor/centixio-runtime.min.js",
} as const;

function inlineScript(source: string): string {
  return `<script>${source.replace(/<\/script/gi, "<\\/script")}</script>`;
}

function scriptTags(spec: DesignSpec, opts: AssembleOptions): string {
  const needed: (keyof typeof SCRIPT_FILES)[] = ["gsap", "scrollTrigger"];
  needed.push("runtime");
  if (opts.mode === "export-single") {
    if (!opts.inlineScripts) throw new Error("inlineScripts required for single-file export");
    return needed.map((k) => inlineScript(opts.inlineScripts![k])).join("\n");
  }
  const base = opts.mode === "preview" ? `${(opts.appOrigin ?? "").replace(/\/$/, "")}/` : (opts.scriptBase ?? "");
  return needed.map((k) => `<script src="${esc(base + SCRIPT_FILES[k])}" defer></script>`).join("\n");
}

function defaultFavicon(spec: DesignSpec): string {
  const initial = esc((spec.brand.name.trim()[0] || "•").toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${spec.palette.background}"/><circle cx="32" cy="32" r="22" fill="${spec.palette.accent}"/><text x="32" y="42" text-anchor="middle" font-family="Georgia,serif" font-size="28" fill="${spec.palette.background}">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function previewCsp(opts: AssembleOptions): string {
  const origins = Array.from(new Set([opts.appOrigin, ...(opts.assetOrigins ?? [])].filter(Boolean))).join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${opts.appOrigin ?? ""}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `img-src data: blob: ${origins}`,
    `connect-src data: blob: ${origins}`,
    "media-src data: blob:",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

/** Renders a complete, self-describing HTML document for a design spec. */
export function assembleSite(spec: DesignSpec, opts: AssembleOptions): string {
  const filmBase = opts.mode === "preview" ? `${(opts.appOrigin ?? "").replace(/\/$/, "")}/` : (opts.scriptBase ?? "");
  const ctx: RenderContext = { spec, assets: opts.assets, modelUrl: opts.modelUrl, filmUrl: (p) => opts.inlineFilms?.[p] ?? `${filmBase}${p}` };
  const s = spec.scene;
  const bgStage = s.enabled && s.placement === "background";
  const catalogModel = s.source.type === "catalog" ? getModel(s.source.modelId) : undefined;

  const body = spec.sections.map((section, i) => renderSection(section, ctx, i)).join("\n");
  const navTargets = spec.sections.filter((x) => !["hero", "kinetic-type", "cta"].includes(x.type)).slice(0, 4);
  const logoUrl = spec.brand.logoAssetId ? opts.assets.url(spec.brand.logoAssetId) : null;
  const logo = logoUrl
    ? `<img src="${safeUrl(logoUrl)}" alt="${esc(spec.brand.name)}">`
    : `<span>${esc(spec.brand.name)}</span>`;
  const navLinks = navTargets.map((x) => `<a href="#${x.id}">${esc(x.eyebrow && x.eyebrow !== spec.brand.name ? x.eyebrow : NAV_LABELS[x.type])}</a>`).join("");

  const favicon = (spec.assets.faviconAssetId && opts.assets.url(spec.assets.faviconAssetId)) || defaultFavicon(spec);
  const social = spec.assets.socialImageAssetId ? opts.assets.url(spec.assets.socialImageAssetId) : null;

  const runtimeConfig = {
    preview: opts.mode === "preview",
    previewNonce: opts.mode === "preview" ? (opts.previewNonce ?? null) : null,
    palette: spec.palette,
    scene: {
      ...s,
      modelId: s.source.type === "catalog" ? s.source.modelId : null,
      modelDefault: catalogModel?.defaultMaterial ?? "satin-plastic",
    },
    motion: spec.motion,
  };

  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="${esc(spec.meta.lang)}"${bgStage ? ` class="cx-has-bg-stage"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${opts.mode === "preview" ? `<meta http-equiv="Content-Security-Policy" content="${esc(previewCsp(opts))}">` : ""}
<title>${esc(spec.meta.title)}</title>
<meta name="description" content="${esc(spec.meta.description)}">
<meta name="theme-color" content="${spec.palette.background}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(spec.meta.title)}">
<meta property="og:description" content="${esc(spec.meta.description)}">
${social ? `<meta property="og:image" content="${safeUrl(social)}">\n<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<link rel="icon" href="${safeUrl(favicon)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(googleFontsHref([spec.typography.display, spec.typography.body]))}">
<script>document.documentElement.classList.add("cx-js");setTimeout(function(){if(!window.__cxBooted)document.documentElement.classList.add("cx-static")},4000);</script>
<style>${buildStyles(spec)}</style>
</head>
<body>
<a class="cx-skip" href="#main">Skip to content</a>
${bgStage ? `<div class="cx-stage-bg" aria-hidden="true">${stage(ctx, "main")}</div>` : ""}
<header class="cx-header">
  <a class="cx-logo" href="#main" aria-label="${esc(spec.brand.name)} — home">${logo}</a>
  <nav class="cx-nav" aria-label="Primary">${navLinks}</nav>
  <details class="cx-menu"><summary aria-label="Open menu">Menu</summary><div>${navLinks}</div></details>
  <a class="cx-btn" href="${safeUrl(spec.brand.cta.href)}">${esc(spec.brand.cta.label)}</a>
</header>
<div id="cx-smooth-wrapper"><div id="cx-smooth-content">
<main id="main">
${body}
</main>
<footer class="cx-footer"><div class="cx-wrap"><span>© ${year} ${esc(spec.brand.name)}</span><span>${esc(spec.brand.tagline)}</span></div></footer>
</div></div>
<script type="application/json" id="cx-config">${jsonForScript(runtimeConfig)}</script>
${scriptTags(spec, opts)}
<script>document.addEventListener("DOMContentLoaded",function(){window.CentixioRuntime&&window.CentixioRuntime.boot()});</script>
</body>
</html>
`;
}

export type { AssetResolver } from "./sections";
