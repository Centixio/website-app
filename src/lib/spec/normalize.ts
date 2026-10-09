import { DesignSpecSchema, type AIPlan, type DesignSpec, type Palette, type Section, type SectionItem } from "./schema";
import { resolveConflicts, type SectionType, type WebsiteConfig } from "@/lib/config-schema";
import { getDirection } from "@/lib/catalog/directions";
import { FONT_PAIRINGS, isKnownFont } from "@/lib/catalog/fonts";
import { getModel, LIGHTING_PRESETS, MATERIAL_PRESETS } from "@/lib/catalog/models";
import { resolveAutoConfig, resolveProfile, type AssetSummary } from "@/lib/recommend/engine";
import { contrastRatio, luminance, mix, onColor, slugify } from "@/lib/assembler/html";
import { sectionContent } from "@/lib/ai/rules-planner";
import { getFilm } from "@/lib/catalog/films";

export interface NormalizeInput {
  plan: AIPlan;
  config: WebsiteConfig;
  assets: AssetSummary[];
  prompt: string;
  /**
   * "config" (default): the user's explicit settings win over the plan.
   * "plan": used for chat edits — the edited plan wins and the returned
   * config reflects it, so settings and the new version stay in sync.
   */
  prefer?: "config" | "plan";
}

/** Overlay a plan's choices onto a config (used when the plan should win). */
export function applyPlanToConfig(plan: AIPlan, config: WebsiteConfig, assets: AssetSummary[]): WebsiteConfig {
  const c = structuredClone(config);
  const direction = getDirection(plan.direction);
  c.direction = direction.id;
  const uploaded = assets.find((a) => a.kind === "model" && a.id === config.scene.uploadedModelAssetId) ?? assets.find((a) => a.kind === "model");
  if (plan.scene.modelId === "uploaded" && uploaded) {
    c.scene.subject = "uploaded";
    c.scene.uploadedModelAssetId = uploaded.id;
  } else if (getModel(plan.scene.modelId)) {
    c.scene.modelId = plan.scene.modelId;
    if (c.scene.subject === "uploaded") c.scene.subject = "auto";
  }
  c.scene.enabled = plan.scene.enabled;
  c.scene.placement = plan.scene.placement;
  c.scene.material = MATERIAL_PRESETS.some((m) => m.id === plan.scene.material) ? plan.scene.material : c.scene.material;
  c.scene.lighting = LIGHTING_PRESETS.some((l) => l.id === plan.scene.lighting) ? plan.scene.lighting : c.scene.lighting;
  c.scene.framing = plan.scene.framing;
  c.scene.autoRotate = plan.scene.autoRotate;
  c.scene.pointerInteraction = plan.scene.pointer;
  c.scene.scrollCamera = plan.scene.scrollCamera;
  c.scene.explodedView = plan.scene.exploded;
  c.scene.quality = plan.scene.quality;
  c.scene.mobile = plan.scene.mobile;
  const m = plan.motion;
  c.motion = {
    intensity: m.intensity,
    smoothScroll: m.smoothScroll,
    pinnedSections: m.pinned,
    scrollCamera: plan.scene.scrollCamera,
    parallax: m.parallax,
    horizontalSections: m.horizontal,
    textReveals: m.textReveals,
    staggeredEntrances: m.stagger,
    imageTransitions: m.imageTransitions,
    particles: m.particles,
    hoverInteractions: m.hover,
    customCursor: m.cursor,
    sectionTransition: m.transition,
  };
  c.brand.sectionsMode = "custom";
  c.brand.sections = plan.sections.map((s) => s.type).slice(0, 14);
  const pairing = FONT_PAIRINGS.find((f) => f.display === plan.displayFont && f.body === plan.bodyFont);
  c.brand.fontPairing = pairing?.id ?? c.brand.fontPairing;
  const p = plan.palette;
  const differs = (["background", "accent", "accent2"] as const).some((k) => p[k]?.toLowerCase() !== direction.palette[k].toLowerCase());
  if (differs && HEX.test(p.background) && HEX.test(p.accent)) {
    c.brand.colors = { mode: "custom", primary: p.accent, secondary: HEX.test(p.accent2) ? p.accent2 : c.brand.colors.secondary, background: p.background };
  } else if (!differs) {
    c.brand.colors = { ...c.brand.colors, mode: "auto" };
  }
  if (plan.brandName && !config.brand.brandName) c.brand.brandName = plan.brandName.slice(0, 80);
  return c;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (s: string | undefined, n: number) => {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  return v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v;
};
const clampMulti = (s: string | undefined, n: number) => {
  const v = (s ?? "").replace(/[ \t]+/g, " ").trim();
  return v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v;
};

function fixPalette(p: Partial<Palette>, fallback: Palette): Palette {
  const pick = (k: keyof Palette) => (p[k] && HEX.test(p[k]!) ? p[k]! : fallback[k]);
  const out: Palette = { background: pick("background"), surface: pick("surface"), text: pick("text"), muted: pick("muted"), accent: pick("accent"), accent2: pick("accent2") };
  if (contrastRatio(out.text, out.background) < 7) out.text = luminance(out.background) < 0.35 ? "#F5F3EE" : "#121212";
  if (contrastRatio(out.muted, out.background) < 4.5) out.muted = mix(out.text, out.background, 0.35);
  if (contrastRatio(out.surface, out.background) > 1.6 || contrastRatio(out.text, out.surface) < 4.5) out.surface = mix(out.background, out.text, 0.06);
  // Accent must be visible against the background (buttons use on-accent text).
  if (contrastRatio(out.accent, out.background) < 2.2) out.accent = luminance(out.background) < 0.35 ? mix(out.accent, "#FFFFFF", 0.45) : mix(out.accent, "#000000", 0.45);
  return out;
}

function customPalette(config: WebsiteConfig, base: Palette): Palette {
  const bg = config.brand.colors.background;
  const dark = luminance(bg) < 0.35;
  return {
    background: bg,
    surface: mix(bg, dark ? "#FFFFFF" : "#000000", 0.05),
    text: dark ? "#F5F3EE" : "#141414",
    muted: dark ? mix("#F5F3EE", bg, 0.4) : mix("#141414", bg, 0.4),
    accent: config.brand.colors.primary,
    accent2: config.brand.colors.secondary ?? base.accent2,
  };
}

function safeHref(url: string): string | null {
  const v = url.trim();
  if (/^https?:\/\/[^\s]+$/i.test(v) || /^mailto:[^\s@]+@[^\s@]+$/i.test(v) || /^#[a-z][\w-]*$/i.test(v)) return v.slice(0, 500);
  return null;
}

/**
 * Turn any plan (AI or rules) plus the user's configuration into a strict,
 * internally consistent DesignSpec. The user's explicit (non-"auto")
 * choices always win over the plan.
 */
export function normalizePlan(input: NormalizeInput): { spec: DesignSpec; fixes: string[]; config: WebsiteConfig } {
  const { plan, assets, prompt } = input;
  const config = input.prefer === "plan" ? applyPlanToConfig(plan, input.config, assets) : input.config;
  const fixes: string[] = [];
  const auto = (v: string) => v === "auto";
  const profile = resolveProfile({ prompt, config, assets });
  const resolved = resolveAutoConfig({ prompt, config, assets });
  const imageIds = new Set(assets.filter((a) => a.kind === "image" || a.kind === "logo").map((a) => a.id));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  // Direction, palette, type
  const directionId = !auto(config.direction) ? config.direction : plan.direction ?? profile.direction;
  const direction = getDirection(directionId);
  let palette = config.brand.colors.mode === "custom" ? customPalette(config, direction.palette) : fixPalette(plan.palette ?? {}, direction.palette);
  if (config.brand.colors.mode !== "custom" && JSON.stringify(palette) !== JSON.stringify(plan.palette)) fixes.push("Adjusted colors for readable contrast.");
  palette = fixPalette(palette, direction.palette);

  const pairing = FONT_PAIRINGS.find((f) => f.id === config.brand.fontPairing && f.id !== "auto");
  const display = pairing?.display ?? (isKnownFont(plan.displayFont) ? plan.displayFont : direction.fonts.display);
  const body = pairing?.body ?? (isKnownFont(plan.bodyFont) ? plan.bodyFont : direction.fonts.body);

  // Scene
  const uploaded = config.scene.uploadedModelAssetId ? assetById.get(config.scene.uploadedModelAssetId) : undefined;
  const useUpload = (config.scene.subject === "uploaded" || (auto(config.scene.subject) && plan.scene.modelId === "uploaded")) && uploaded?.kind === "model";
  let modelId = config.scene.modelId ?? (getModel(plan.scene.modelId) ? plan.scene.modelId : resolved.scene.modelId) ?? profile.modelId;
  if (!getModel(modelId)) {
    fixes.push(`Unknown model "${modelId}" replaced with ${profile.modelId}.`);
    modelId = profile.modelId;
  }
  const separable = useUpload ? Boolean(uploaded?.meta.separable) : Boolean(getModel(modelId)?.separable);
  const { config: c, notes: conflictNotes } = resolveConflicts(resolved, { modelSeparable: separable });
  fixes.push(...conflictNotes);
  const sceneEnabled = c.scene.enabled;
  const placement = !auto(config.scene.placement) ? (config.scene.placement as DesignSpec["scene"]["placement"]) : plan.scene.placement ?? profile.placement;
  const material = !auto(config.scene.material) ? config.scene.material : MATERIAL_PRESETS.some((m) => m.id === plan.scene.material) ? plan.scene.material : "auto";
  const lighting = !auto(config.scene.lighting) ? config.scene.lighting : LIGHTING_PRESETS.some((l) => l.id === plan.scene.lighting && l.id !== "auto") ? plan.scene.lighting : direction.defaultLighting;
  const framing = (!auto(config.scene.framing) ? config.scene.framing : plan.scene.framing ?? profile.framing) as DesignSpec["scene"]["framing"];
  const quality = (c.scene.quality === "auto" ? "medium" : c.scene.quality) as DesignSpec["scene"]["quality"];

  // Motion
  const intensity = (!auto(config.motion.intensity) ? config.motion.intensity : plan.motion.intensity ?? profile.intensity) as DesignSpec["motion"]["intensity"];
  const transition = (!auto(config.motion.sectionTransition) ? config.motion.sectionTransition : plan.motion.transition ?? "slide-up") as DesignSpec["motion"]["transition"];

  // Sections
  const brandName = clamp(config.brand.brandName || plan.brandName || "Your Brand", 80);
  const ctaLabel = clamp(config.brand.primaryCta || plan.ctaLabel || "Get started", 48);
  const copyCtx = {
    brand: brandName,
    noun: "product",
    industry: profile.industry,
    audience: config.brand.audience,
    description: config.brand.description || prompt,
    brandDescription: config.brand.description,
    cta: ctaLabel,
    images: config.brand.imageAssetIds.filter((id) => imageIds.has(id)),
  };
  const planSections = plan.sections ?? [];
  let types: SectionType[] = config.brand.sectionsMode === "custom" && config.brand.sections.length ? [...config.brand.sections] : planSections.map((s) => s.type);
  if (!types.length) types = profile.sections;
  const used = new Set<number>();
  let draft = types.map((type) => {
    const idx = planSections.findIndex((s, i) => s.type === type && !used.has(i));
    if (idx >= 0) used.add(idx);
    return idx >= 0 ? planSections[idx] : sectionContent(type, copyCtx);
  });

  // Structural rules
  if (!sceneEnabled) {
    const before = draft.length;
    draft = draft.map((s) => (s.type === "object-showcase" ? { ...s, type: "pinned-story" as const } : s.type === "exploded-view" ? { ...s, type: "features" as const } : s)).filter((s) => s.type !== "abstract-scene");
    if (before !== draft.length) fixes.push("Removed the interactive scene section because 3D is off.");
  } else {
    if (!c.scene.explodedView) draft = draft.map((s) => (s.type === "exploded-view" ? { ...s, type: "features" as const } : s));
    if (c.scene.explodedView && !draft.some((s) => s.type === "exploded-view")) draft.splice(Math.max(1, draft.length - 1), 0, sectionContent("exploded-view", copyCtx));
    if (placement === "product-showcase" && !draft.some((s) => s.type === "object-showcase")) draft.splice(1, 0, sectionContent("object-showcase", copyCtx));
    if (placement === "dedicated-section" && !draft.some((s) => s.type === "abstract-scene")) draft.splice(Math.min(2, draft.length), 0, sectionContent("abstract-scene", copyCtx));
  }
  // Scroll films need a pre-rendered film from the catalog; drop any that don't resolve.
  const beforeFilms = draft.length;
  draft = draft.filter((s) => s.type !== "scroll-film" || Boolean(getFilm(s.filmId)));
  if (draft.length !== beforeFilms) fixes.push("Removed a scroll film section because no pre-rendered film is available for it.");
  const heroIdx = draft.findIndex((s) => s.type === "hero");
  if (heroIdx > 0) draft.unshift(draft.splice(heroIdx, 1)[0]);
  if (heroIdx < 0) {
    draft.unshift(sectionContent("hero", copyCtx));
    fixes.push("Added a hero section.");
  }
  // Only one hero
  draft = draft.filter((s, i) => s.type !== "hero" || i === 0);
  const last = draft[draft.length - 1];
  if (last.type !== "cta" && last.type !== "contact") draft.push(sectionContent("cta", copyCtx));
  draft = draft.slice(0, 14);

  const ids = new Set<string>();
  const sections: Section[] = draft.map((s) => {
    let id = slugify(s.eyebrow && s.type !== "hero" ? s.eyebrow : s.type, s.type);
    while (ids.has(id)) id = `${id.slice(0, 36)}-${ids.size}`;
    ids.add(id);
    const items: SectionItem[] | undefined = s.items
      ?.slice(0, s.type === "pricing" ? 4 : 10)
      .map((it) => ({
        title: clamp(it.title, 140) || "—",
        body: it.body ? clampMulti(it.body, 700) : undefined,
        meta: it.meta ? clamp(it.meta, 80) : undefined,
        imageAssetId: it.imageAssetId && imageIds.has(it.imageAssetId) ? it.imageAssetId : undefined,
      }));
    const ctaHref = config.brand.primaryCtaUrl ? safeHref(config.brand.primaryCtaUrl) : null;
    return {
      id,
      type: s.type,
      eyebrow: s.eyebrow ? clamp(s.eyebrow, 60) : undefined,
      heading: clamp(s.heading, 160) || brandName,
      body: s.body ? clampMulti(s.body, 900) : undefined,
      items,
      cta: "ctaLabel" in s && s.ctaLabel ? { label: clamp(s.ctaLabel, 48), href: ctaHref ?? "#top" } : undefined,
      imageAssetIds: s.imageAssetIds?.filter((id) => imageIds.has(id)).slice(0, 12),
      variant: s.variant ?? "default",
      filmId: s.type === "scroll-film" && getFilm(s.filmId) ? s.filmId : undefined,
    };
  });

  // Default CTA target: explicit URL, else contact section, else the last section.
  const contact = sections.find((s) => s.type === "contact");
  const ctaHref = safeHref(config.brand.primaryCtaUrl) ?? (contact ? `#${contact.id}` : `#${sections[sections.length - 1].id}`);
  for (const s of sections) if (s.cta && s.cta.href === "#top") s.cta.href = ctaHref;
  if (config.brand.primaryCtaUrl && !safeHref(config.brand.primaryCtaUrl)) fixes.push("The call-to-action URL was not a valid http(s) or mailto link and was replaced with an in-page link.");

  const imageAlts: Record<string, string> = {};
  for (const a of assets.filter((x) => x.kind === "image")) {
    const fromPlan = plan.imageAlts?.find((x) => x.assetId === a.id)?.alt;
    imageAlts[a.id] = clamp(fromPlan || a.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "), 200);
  }

  const contactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.output.contactEmail.trim()) ? config.output.contactEmail.trim() : "";
  const formEndpoint = /^https:\/\/[^\s]+$/i.test(config.output.formEndpoint.trim()) ? config.output.formEndpoint.trim() : "";
  const assetIf = (id: string | null, kinds: AssetSummary["kind"][]) => (id && kinds.includes(assetById.get(id)?.kind as AssetSummary["kind"]) ? id : null);

  const spec: DesignSpec = {
    version: 1,
    meta: {
      title: clamp(config.output.seoTitle || plan.title || brandName, 70),
      description: clamp(config.output.seoDescription || plan.description || plan.tagline || brandName, 170),
      lang: /^[a-z]{2}(-[A-Z]{2})?$/.test(config.brand.language) ? config.brand.language : "en",
    },
    brand: {
      name: brandName,
      tagline: clamp(plan.tagline || brandName, 140),
      logoAssetId: assetIf(config.brand.logoAssetId, ["logo", "image"]),
      cta: { label: ctaLabel, href: ctaHref },
    },
    direction: direction.id,
    palette,
    typography: { display, body, scale: plan.typeScale ?? "standard", displayCase: direction.displayCase },
    radius: direction.radius,
    scene: {
      enabled: sceneEnabled,
      source: useUpload && uploaded ? { type: "upload", assetId: uploaded.id, separable } : { type: "catalog", modelId },
      placement,
      material,
      lighting,
      framing: ["hero-close", "three-quarter", "wide", "low-angle"].includes(framing) ? framing : "three-quarter",
      autoRotate: c.scene.autoRotate,
      pointer: c.scene.pointerInteraction,
      scrollCamera: c.scene.scrollCamera,
      exploded: c.scene.explodedView && separable,
      quality,
      mobile: c.scene.mobile,
    },
    motion: {
      intensity,
      smoothScroll: c.motion.smoothScroll,
      pinned: c.motion.pinnedSections,
      parallax: c.motion.parallax,
      horizontal: c.motion.horizontalSections,
      textReveals: c.motion.textReveals,
      stagger: c.motion.staggeredEntrances,
      imageTransitions: c.motion.imageTransitions,
      particles: c.motion.particles,
      hover: c.motion.hoverInteractions,
      cursor: c.motion.customCursor,
      transition,
      reduceOnMobile: true,
    },
    sections,
    assets: {
      faviconAssetId: assetIf(config.output.faviconAssetId, ["favicon", "image", "logo"]),
      socialImageAssetId: assetIf(config.output.socialImageAssetId, ["social", "image"]),
      imageAlts,
    },
    integrations: { contactEmail, formEndpoint },
    notes: (plan.notes ?? []).slice(0, 6).map((n) => clamp(n, 300)),
  };

  return { spec: DesignSpecSchema.parse(spec), fixes, config };
}

/** Apply explicit configuration to an existing spec without re-planning content (free re-assembly). */
export function reapplyConfig(spec: DesignSpec, config: WebsiteConfig, assets: AssetSummary[], prompt: string): { spec: DesignSpec; fixes: string[]; config: WebsiteConfig } {
  const plan: AIPlan = specToPlan(spec);
  // Content stays; sections follow the existing spec unless the user customized them.
  const cfg: WebsiteConfig = config.brand.sectionsMode === "custom" ? config : { ...config, brand: { ...config.brand, sectionsMode: "custom", sections: spec.sections.map((s) => s.type) } };
  return normalizePlan({ plan, config: cfg, assets, prompt });
}

/** Convert a spec back to plan shape so edits can round-trip through the normalizer. */
export function specToPlan(spec: DesignSpec): AIPlan {
  return {
    title: spec.meta.title,
    description: spec.meta.description,
    brandName: spec.brand.name,
    tagline: spec.brand.tagline,
    ctaLabel: spec.brand.cta.label,
    direction: (getDirection(spec.direction).id as AIPlan["direction"]) ?? "custom",
    palette: spec.palette,
    displayFont: spec.typography.display,
    bodyFont: spec.typography.body,
    typeScale: spec.typography.scale,
    scene: {
      enabled: spec.scene.enabled,
      modelId: spec.scene.source.type === "upload" ? "uploaded" : spec.scene.source.modelId,
      placement: spec.scene.placement,
      material: spec.scene.material,
      lighting: spec.scene.lighting,
      framing: spec.scene.framing,
      autoRotate: spec.scene.autoRotate,
      pointer: spec.scene.pointer,
      scrollCamera: spec.scene.scrollCamera,
      exploded: spec.scene.exploded,
      quality: spec.scene.quality,
      mobile: spec.scene.mobile,
    },
    motion: { ...spec.motion },
    sections: spec.sections.map((s) => ({
      type: s.type,
      eyebrow: s.eyebrow,
      heading: s.heading,
      body: s.body,
      variant: s.variant,
      items: s.items?.map((i) => ({ title: i.title, body: i.body, meta: i.meta, imageAssetId: i.imageAssetId })),
      ctaLabel: s.cta?.label,
      imageAssetIds: s.imageAssetIds,
      filmId: s.filmId,
    })),
    imageAlts: Object.entries(spec.assets.imageAlts).map(([assetId, alt]) => ({ assetId, alt })),
    notes: spec.notes,
  };
}

export { onColor };
