import type { DesignSpec, Section, SectionItem } from "@/lib/spec/schema";
import { getModel } from "@/lib/catalog/models";
import { getFilm } from "@/lib/catalog/films";
import { esc, jsonForScript, mix, paragraphs, safeUrl } from "./html";

export interface AssetResolver {
  /** URL (absolute, relative path, or data URI) for an asset id, or null if unavailable. */
  url(assetId: string): string | null;
}

export interface RenderContext {
  spec: DesignSpec;
  assets: AssetResolver;
  /** URL for an uploaded model when the scene uses one. */
  modelUrl: string | null;
  /** Resolves a film file path (e.g. "films/nocturne/film.mp4") for the current mode. */
  filmUrl: (path: string) => string;
}

const ARROW = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function transitionAttr(spec: DesignSpec): string {
  return spec.motion.transition === "none" ? "" : ` data-cx-transition="${spec.motion.transition}"`;
}

function revealAttr(spec: DesignSpec): string {
  return spec.motion.textReveals ? " data-cx-reveal" : "";
}

function staggerAttr(spec: DesignSpec): string {
  return spec.motion.stagger ? " data-cx-stagger" : "";
}

function button(label: string, href: string, ghost = false, magnetic = false): string {
  return `<a class="cx-btn${ghost ? " cx-btn--ghost" : ""}" href="${safeUrl(href)}"${magnetic ? " data-cx-magnetic" : ""}>${esc(label)}${ghost ? "" : ARROW}</a>`;
}

/** A 3D stage container. The runtime mounts a canvas inside; the fallback shows when WebGL is unavailable. */
export function stage(ctx: RenderContext, kind: "main" | "exploded" | "abstract", overrides: { modelId?: string } = {}): string {
  const s = ctx.spec.scene;
  const attrs: string[] = [`data-cx-stage="${kind}"`];
  if (overrides.modelId) {
    attrs.push(`data-model="${esc(overrides.modelId)}"`);
    const m = getModel(overrides.modelId);
    if (m) attrs.push(`data-model-default="${esc(m.defaultMaterial)}"`);
  } else if (s.source.type === "upload" && ctx.modelUrl) {
    attrs.push(`data-model-url="${safeUrl(ctx.modelUrl)}"`);
  }
  const label = kind === "abstract" ? "Interactive 3D scene" : "Interactive 3D model";
  return `<div class="cx-stage" ${attrs.join(" ")} role="img" aria-label="${label}"><div class="cx-fallback"><span>Interactive 3D is unavailable on this device</span></div></div>`;
}

function sectionHead(section: Section, spec: DesignSpec): string {
  return `<div class="cx-head"><div>${section.eyebrow ? `<span class="cx-eyebrow">${esc(section.eyebrow)}</span>` : ""}<h2${revealAttr(spec)}>${esc(section.heading)}</h2></div>${section.body ? `<div>${paragraphs(section.body)}</div>` : ""}</div>`;
}

function mediaFor(ctx: RenderContext, assetId: string | undefined, alt: string, fallbackLabel: string): string {
  const url = assetId ? ctx.assets.url(assetId) : null;
  const imgAttr = ctx.spec.motion.imageTransitions ? " data-cx-img" : "";
  if (url) {
    const altText = (assetId && ctx.spec.assets.imageAlts[assetId]) || alt;
    return `<div class="cx-media"${imgAttr}><img src="${safeUrl(url)}" alt="${esc(altText)}" loading="lazy" decoding="async"></div>`;
  }
  return `<div class="cx-media"${imgAttr}><div class="cx-art" aria-hidden="true">${esc(fallbackLabel.slice(0, 2))}</div></div>`;
}

export function renderHero(section: Section, ctx: RenderContext, isFirst: boolean): string {
  const { spec } = ctx;
  const headingTag = isFirst ? "h1" : "h2";
  const cta = section.cta ?? spec.brand.cta;
  const secondary = spec.sections.find((s) => s.type !== "hero");
  const actions = `<div class="cx-actions">${button(cta.label, cta.href, false, spec.motion.hover)}${secondary ? button(secondary.eyebrow || "Explore", `#${secondary.id}`, true) : ""}</div>`;
  const text = `${section.eyebrow ? `<span class="cx-eyebrow">${esc(section.eyebrow)}</span>` : ""}<${headingTag}${revealAttr(spec)}>${esc(section.heading)}</${headingTag}>${section.body ? `<p class="cx-hero-lead">${esc(section.body)}</p>` : ""}${actions}`;
  const sceneInHero = spec.scene.enabled && spec.scene.placement === "hero" && isFirst;
  if (sceneInHero) {
    return `<section id="${section.id}" class="cx-hero"><div class="cx-wrap cx-hero-grid"><div>${text}</div>${stage(ctx, "main")}</div></section>`;
  }
  const image = section.imageAssetIds?.[0];
  const media = image && ctx.assets.url(image) ? `<div class="cx-hero-media" data-cx-parallax="0.15">${mediaFor(ctx, image, spec.brand.name, spec.brand.name)}</div>` : "";
  return `<section id="${section.id}" class="cx-hero cx-hero--centered"><div class="cx-wrap">${text}${media}</div>${spec.motion.intensity !== "subtle" ? `<span class="cx-scroll-hint" aria-hidden="true">Scroll</span>` : ""}</section>`;
}

function renderShowcase(section: Section, ctx: RenderContext): string {
  const steps = (section.items ?? []).slice(0, 5);
  const height = Math.max(2, steps.length + 1) * 100;
  return `<section id="${section.id}" class="cx-section cx-showcase" data-cx-showcase style="height:${height}vh"><div class="cx-wrap cx-sticky">${stage(ctx, "main")}<div><span class="cx-eyebrow">${esc(section.eyebrow || "In detail")}</span><h2${revealAttr(ctx.spec)} style="margin-bottom:2rem">${esc(section.heading)}</h2><div class="cx-steps">${steps
    .map((s, i) => `<article class="cx-step${i === 0 ? " is-active" : ""}" data-cx-step><span class="cx-step-meta">${esc(s.meta || String(i + 1).padStart(2, "0"))}</span><h3>${esc(s.title)}</h3>${paragraphs(s.body, "cx-muted")}</article>`)
    .join("")}</div></div></div></section>`;
}

function renderExploded(section: Section, ctx: RenderContext): string {
  const parts = section.items ?? [];
  return `<section id="${section.id}" class="cx-section cx-exploded"><div class="cx-wrap cx-exploded-grid">${stage(ctx, "exploded")}<div><span class="cx-eyebrow">${esc(section.eyebrow || "Anatomy")}</span><h2${revealAttr(ctx.spec)}>${esc(section.heading)}</h2>${paragraphs(section.body, "cx-muted")}<ul class="cx-parts"${staggerAttr(ctx.spec)}>${parts
    .map((p) => `<li><strong>${esc(p.title)}</strong>${p.body ? `<span class="cx-muted">${esc(p.body)}</span>` : ""}</li>`)
    .join("")}</ul></div></div></section>`;
}

function renderStory(section: Section, ctx: RenderContext): string {
  const steps = section.items ?? [];
  const pin = ctx.spec.motion.pinned ? " data-cx-pin-story" : "";
  return `<section id="${section.id}" class="cx-section cx-story"${pin}><div class="cx-wrap cx-story-grid"><div><span class="cx-eyebrow">${esc(section.eyebrow || "The story")}</span><h2${revealAttr(ctx.spec)}>${esc(section.heading)}</h2>${paragraphs(section.body, "cx-muted")}</div><ol class="cx-story-steps" role="list" style="list-style:none;padding:0;margin:0">${steps
    .map((s, i) => `<li class="cx-story-step${i === 0 ? " is-active" : ""}" data-cx-step><span class="cx-step-meta cx-eyebrow" style="margin-bottom:0.5rem">${esc(s.meta || String(i + 1).padStart(2, "0"))}</span><h3>${esc(s.title)}</h3>${paragraphs(s.body, "cx-muted")}</li>`)
    .join("")}</ol></div></section>`;
}

function renderFeatures(section: Section, ctx: RenderContext): string {
  const items = section.items ?? [];
  return `<section id="${section.id}" class="cx-section"${transitionAttr(ctx.spec)}><div class="cx-wrap cx-inner">${sectionHead(section, ctx.spec)}<div class="cx-grid"${staggerAttr(ctx.spec)}>${items
    .map((it, i) => `<article class="cx-card"><span class="cx-num">${esc(it.meta || String(i + 1).padStart(2, "0"))}</span><h3>${esc(it.title)}</h3>${it.body ? `<p>${esc(it.body)}</p>` : ""}</article>`)
    .join("")}</div></div></section>`;
}

function renderKinetic(section: Section): string {
  const words = [section.heading, ...(section.items ?? []).map((i) => i.title)].filter(Boolean).slice(0, 4);
  const run = words.map((w) => `<span>${esc(w)}</span>`).join("");
  return `<section id="${section.id}" class="cx-kinetic" aria-label="${esc(section.heading)}"><div class="cx-marquee-track"><div style="display:flex;gap:3rem">${run}</div><div style="display:flex;gap:3rem" aria-hidden="true">${run}</div></div></section>`;
}

/**
 * Galleries with 3+ real images also get a WebGL depth-gallery treatment
 * (Z-stacked images crossfading over mood colors, scrubbed by scroll). The
 * static grid stays in the DOM as the fallback and for no-JS / reduced motion.
 */
function depthData(section: Section, items: SectionItem[], ids: string[], ctx: RenderContext): string {
  if (section.variant === "minimal") return "";
  const p = ctx.spec.palette;
  const images = items
    .map((it, i) => ({ src: ctx.assets.url(it.imageAssetId ?? ids[i] ?? ""), caption: it.title, meta: it.meta && !/^\d+$/.test(it.meta) ? it.meta : "" }))
    .filter((x): x is { src: string; caption: string; meta: string } => Boolean(x.src))
    .slice(0, 8);
  if (images.length < 3) return "";
  const moods = images.map((_, i) => ({ bg: mix(p.background, i % 2 ? p.accent2 : p.accent, 0.1 + (i % 3) * 0.05), b1: i % 2 ? p.accent2 : p.accent, b2: i % 2 ? p.accent : p.accent2 }));
  return `<script type="application/json" data-cx-depth-data>${jsonForScript({ images, moods })}</script>`;
}

function renderGallery(section: Section, ctx: RenderContext): string {
  const ids = section.imageAssetIds ?? [];
  const items: SectionItem[] = section.items?.length ? section.items : ids.map((id) => ({ title: ctx.spec.assets.imageAlts[id] || "", imageAssetId: id }));
  const depth = depthData(section, items, ids, ctx);
  return `<section id="${section.id}" class="cx-section${depth ? " cx-depth" : ""}"${depth ? " data-cx-depth" : ""}${transitionAttr(ctx.spec)}>${depth}<div class="cx-wrap cx-inner">${sectionHead(section, ctx.spec)}<div class="cx-gallery-grid"${staggerAttr(ctx.spec)}>${items
    .slice(0, 10)
    .map((it, i) => `<figure>${mediaFor(ctx, it.imageAssetId ?? ids[i], it.title, it.title)}<figcaption><strong>${esc(it.title)}</strong>${it.meta ? `<span>${esc(it.meta)}</span>` : ""}</figcaption></figure>`)
    .join("")}</div></div></section>`;
}

function renderHorizontal(section: Section, ctx: RenderContext): string {
  const items = section.items ?? [];
  const attr = ctx.spec.motion.horizontal ? " data-cx-horizontal" : "";
  return `<section id="${section.id}" class="cx-section cx-horizontal"${attr}><div class="cx-wrap">${sectionHead(section, ctx.spec)}</div><div class="cx-h-track" tabindex="0" aria-label="${esc(section.heading)} (scrollable)">${items
    .map((it) => `<article class="cx-h-card">${mediaFor(ctx, it.imageAssetId, it.title, it.title)}<div class="cx-h-body">${it.meta ? `<span class="cx-step-meta">${esc(it.meta)}</span>` : ""}<h3>${esc(it.title)}</h3>${it.body ? `<p>${esc(it.body)}</p>` : ""}${it.href ? `<p style="margin-top:1rem"><a href="${safeUrl(it.href)}">View project</a></p>` : ""}</div></article>`)
    .join("")}</div></section>`;
}

function renderAbstract(section: Section, ctx: RenderContext): string {
  const s = ctx.spec.scene;
  // Use a procedural scene here unless the main subject is placed in this dedicated section.
  const useMain = s.placement === "dedicated-section";
  const modelId = useMain ? undefined : s.source.type === "catalog" && getModel(s.source.modelId)?.kind === "procedural" ? s.source.modelId : "wave-field";
  return `<section id="${section.id}" class="cx-section cx-abstract">${stage(ctx, useMain ? "main" : "abstract", modelId ? { modelId } : {})}<div class="cx-overlay">${section.eyebrow ? `<span class="cx-eyebrow">${esc(section.eyebrow)}</span>` : ""}<h2${revealAttr(ctx.spec)}>${esc(section.heading)}</h2>${paragraphs(section.body)}</div></section>`;
}

function renderSpecs(section: Section, ctx: RenderContext): string {
  return `<section id="${section.id}" class="cx-section cx-specs"${transitionAttr(ctx.spec)}><div class="cx-wrap cx-inner">${sectionHead(section, ctx.spec)}<dl${staggerAttr(ctx.spec)}>${(section.items ?? [])
    .map((it) => `<div><dt>${esc(it.title)}</dt><dd>${esc(it.body || it.meta || "")}</dd></div>`)
    .join("")}</dl></div></section>`;
}

function renderPricing(section: Section, ctx: RenderContext): string {
  const fallbackHref = section.cta?.href ?? ctx.spec.brand.cta.href;
  return `<section id="${section.id}" class="cx-section"${transitionAttr(ctx.spec)}><div class="cx-wrap cx-inner">${sectionHead(section, ctx.spec)}<div class="cx-plans"${staggerAttr(ctx.spec)}>${(section.items ?? [])
    .map((it) => {
      const lines = (it.body ?? "").split(/\n|;/).map((l) => l.trim()).filter(Boolean);
      return `<article class="cx-plan"><h3>${esc(it.title)}</h3>${it.meta ? `<div class="cx-price">${esc(it.meta)}</div>` : ""}<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(section.cta?.label || "Get started", it.href ?? fallbackHref, true)}</article>`;
    })
    .join("")}</div></div></section>`;
}

function renderFaq(section: Section, ctx: RenderContext): string {
  return `<section id="${section.id}" class="cx-section"${transitionAttr(ctx.spec)}><div class="cx-wrap cx-inner">${sectionHead(section, ctx.spec)}<div class="cx-faq-list">${(section.items ?? [])
    .map((it) => `<details><summary>${esc(it.title)}</summary>${paragraphs(it.body)}</details>`)
    .join("")}</div></div></section>`;
}

function renderCta(section: Section, ctx: RenderContext): string {
  const cta = section.cta ?? ctx.spec.brand.cta;
  return `<section id="${section.id}" class="cx-section cx-cta"${transitionAttr(ctx.spec)}><div class="cx-wrap cx-inner">${section.eyebrow ? `<span class="cx-eyebrow">${esc(section.eyebrow)}</span>` : ""}<h2${revealAttr(ctx.spec)}>${esc(section.heading)}</h2>${section.body ? `<p>${esc(section.body)}</p>` : ""}<div class="cx-actions">${button(cta.label, cta.href, false, ctx.spec.motion.hover)}</div></div></section>`;
}

/**
 * Contact never renders a form that silently does nothing: it posts to the
 * configured endpoint, or falls back to an email link, or to the main CTA.
 */
function renderContact(section: Section, ctx: RenderContext): string {
  const { formEndpoint, contactEmail } = ctx.spec.integrations;
  const intro = `<div><span class="cx-eyebrow">${esc(section.eyebrow || "Contact")}</span><h2${revealAttr(ctx.spec)}>${esc(section.heading)}</h2>${paragraphs(section.body, "cx-muted")}${contactEmail ? `<p><a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a></p>` : ""}</div>`;
  let action: string;
  if (/^https:\/\//i.test(formEndpoint)) {
    action = `<form class="cx-form" action="${safeUrl(formEndpoint)}" method="POST"><label>Name<input name="name" autocomplete="name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Message<textarea name="message" required></textarea></label><button class="cx-btn" type="submit">Send message${ARROW}</button></form>`;
  } else if (contactEmail) {
    action = `<div class="cx-actions">${button("Email us", `mailto:${contactEmail}`)}</div>`;
  } else {
    action = `<div class="cx-actions">${button(ctx.spec.brand.cta.label, ctx.spec.brand.cta.href)}</div>`;
  }
  return `<section id="${section.id}" class="cx-section"${transitionAttr(ctx.spec)}><div class="cx-wrap cx-inner cx-contact-grid">${intro}${action}</div></section>`;
}

/** Pre-rendered film scrubbed by scroll: sticky stage, poster until the first frame paints, chapter copy. */
function renderFilm(section: Section, ctx: RenderContext): string {
  const film = getFilm(section.filmId);
  if (!film) return "";
  const steps = (section.items ?? []).slice(0, 4);
  const height = Math.max(3, steps.length + 2) * 100;
  return `<section id="${section.id}" class="cx-film" data-cx-film data-src="${safeUrl(ctx.filmUrl(film.files.desktop))}" data-src-mobile="${safeUrl(ctx.filmUrl(film.files.mobile))}" style="--cx-film-h:${height}vh" aria-label="${esc(section.heading)}"><div class="cx-film-stage"><picture><source media="(max-width: 860px)" srcset="${safeUrl(ctx.filmUrl(film.files.posterMobile))}"><img class="cx-film-poster" src="${safeUrl(ctx.filmUrl(film.files.poster))}" alt="${esc(film.description)}" decoding="async"></picture><div class="cx-film-scrim" aria-hidden="true"></div><div class="cx-film-copy cx-wrap">${section.eyebrow ? `<span class="cx-eyebrow">${esc(section.eyebrow)}</span>` : ""}<h2${revealAttr(ctx.spec)}>${esc(section.heading)}</h2>${section.body ? `<p class="cx-muted">${esc(section.body)}</p>` : ""}${steps.length ? `<ol class="cx-film-steps">${steps.map((it, i) => `<li data-cx-film-step${i === 0 ? ' class="is-active"' : ""}><span class="cx-step-meta">${esc(it.meta || String(i + 1).padStart(2, "0"))}</span><strong>${esc(it.title)}</strong>${it.body ? `<span>${esc(it.body)}</span>` : ""}</li>`).join("")}</ol>` : ""}</div><div class="cx-film-progress" aria-hidden="true"><span></span></div></div></section>`;
}

export function renderSection(section: Section, ctx: RenderContext, index: number): string {
  switch (section.type) {
    case "hero":
      return renderHero(section, ctx, index === 0);
    case "object-showcase":
      return ctx.spec.scene.enabled ? renderShowcase(section, ctx) : renderStory(section, ctx);
    case "exploded-view":
      return ctx.spec.scene.enabled && ctx.spec.scene.exploded ? renderExploded(section, ctx) : renderFeatures(section, ctx);
    case "pinned-story":
      return renderStory(section, ctx);
    case "features":
      return renderFeatures(section, ctx);
    case "kinetic-type":
      return renderKinetic(section);
    case "gallery":
      return renderGallery(section, ctx);
    case "horizontal-cases":
      return renderHorizontal(section, ctx);
    case "abstract-scene":
      return ctx.spec.scene.enabled ? renderAbstract(section, ctx) : renderCta(section, ctx);
    case "specs":
      return renderSpecs(section, ctx);
    case "pricing":
      return renderPricing(section, ctx);
    case "faq":
      return renderFaq(section, ctx);
    case "cta":
      return renderCta(section, ctx);
    case "contact":
      return renderContact(section, ctx);
    case "scroll-film":
      return renderFilm(section, ctx);
    default:
      return "";
  }
}
