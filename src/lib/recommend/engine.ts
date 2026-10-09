import type { DeepPartial, SectionType, WebsiteConfig } from "@/lib/config-schema";
import { getModel, MODELS } from "@/lib/catalog/models";
import type { DirectionId } from "@/lib/catalog/directions";

/**
 * Rule-based recommendations. Deterministic and always available; the AI
 * provider may optionally re-rank and rephrase them (see recommend/ai.ts).
 */

export interface AssetSummary {
  id: string;
  kind: "image" | "logo" | "model" | "reference" | "favicon" | "social";
  name: string;
  sizeBytes: number;
  meta: { separable?: boolean; meshCount?: number; dominantColor?: string; width?: number; height?: number };
}

export interface RecommendationInput {
  prompt: string;
  config: WebsiteConfig;
  assets: AssetSummary[];
}

export interface Recommendation {
  id: string;
  title: string;
  explanation: string;
  patch: DeepPartial<WebsiteConfig>;
  preview: { kind: "direction" | "model" | "motion" | "sections" | "performance" | "asset"; directionId?: DirectionId; modelId?: string; assetId?: string };
  /** Which config paths this recommendation touches, for "keep my choices" handling. */
  touches: string[];
  confidence: number;
  source: "rules" | "ai";
}

export type Industry =
  | "fragrance"
  | "jewelry"
  | "watch"
  | "audio"
  | "architecture"
  | "saas"
  | "app"
  | "gaming"
  | "fashion"
  | "agency"
  | "portfolio"
  | "event"
  | "fintech"
  | "generic";

interface Profile {
  industry: Industry;
  label: string;
  direction: DirectionId;
  modelId: string;
  placement: WebsiteConfig["scene"]["placement"];
  lighting: string;
  material: string;
  framing: string;
  intensity: "subtle" | "balanced" | "dramatic";
  scrollCamera: boolean;
  exploded: boolean;
  particles: boolean;
  horizontal: boolean;
  pinned: boolean;
  smoothScroll: boolean;
  sections: SectionType[];
  why: string;
}

const KEYWORDS: [Industry, RegExp][] = [
  ["fragrance", /\b(perfume|fragrance|parfum|cologne|scent|eau de|beauty|skincare|cosmetic)/i],
  ["jewelry", /\b(jewel|jewelry|jewellery|ring|diamond|necklace|gem)/i],
  ["watch", /\b(watch|timepiece|chronograph|wearable|smartwatch)/i],
  ["audio", /\b(headphone|earbud|speaker|audio|sound|music gear|hi-?fi)/i],
  ["architecture", /\b(architect|architecture|interior|real estate|property|building|pavilion|villa|residential)/i],
  ["gaming", /\b(game|gaming|esports|e-sports|rpg|fps|mmo|steam|console|playstation|xbox)/i],
  ["fintech", /\b(fintech|bank|banking|payments?|crypto|defi|wallet|trading|invest)/i],
  ["app", /\b(mobile app|ios app|android app|\bapp\b|smartphone)/i],
  ["saas", /\b(saas|software|platform|api|dashboard|b2b|startup|ai\b|machine learning|analytics|devtool|workflow)/i],
  ["fashion", /\b(fashion|apparel|clothing|streetwear|couture|collection|runway|sneaker)/i],
  ["event", /\b(event|conference|festival|summit|meetup|concert|launch party|expo|tickets?)/i],
  ["agency", /\b(agency|studio|creative studio|branding|design studio|consultancy)/i],
  ["portfolio", /\b(portfolio|photographer|illustrator|designer|freelance|my work|case studies)/i],
];

const PURPOSE_TO_INDUSTRY: Record<string, Industry> = {
  "product-launch": "generic",
  saas: "saas",
  agency: "agency",
  portfolio: "portfolio",
  architecture: "architecture",
  fashion: "fashion",
  luxury: "jewelry",
  gaming: "gaming",
  event: "event",
};

const PROFILES: Record<Industry, Omit<Profile, "industry">> = {
  fragrance: {
    label: "fragrance or beauty brand",
    direction: "luxury",
    modelId: "perfume-bottle",
    placement: "product-showcase",
    lighting: "golden-hour",
    material: "glass",
    framing: "hero-close",
    intensity: "subtle",
    scrollCamera: true,
    exploded: false,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: true,
    sections: ["hero", "object-showcase", "pinned-story", "specs", "cta"],
    why: "A rotating bottle under controlled warm light, with a restrained scroll-driven camera, keeps attention on the product and feels premium without distracting motion.",
  },
  jewelry: {
    label: "luxury or jewelry brand",
    direction: "luxury",
    modelId: "ring",
    placement: "hero",
    lighting: "gallery",
    material: "gold",
    framing: "hero-close",
    intensity: "subtle",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: true,
    sections: ["hero", "pinned-story", "gallery", "specs", "contact"],
    why: "Gallery spotlights and a slow turntable flatter polished metal and stones; subtle motion reads as craftsmanship rather than tech.",
  },
  watch: {
    label: "watch or wearable",
    direction: "cinematic-dark",
    modelId: "smartwatch",
    placement: "product-showcase",
    lighting: "moody-rim",
    material: "brushed-metal",
    framing: "three-quarter",
    intensity: "balanced",
    scrollCamera: true,
    exploded: true,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: true,
    sections: ["hero", "object-showcase", "exploded-view", "features", "specs", "cta"],
    why: "Rim light defines the case edges, the scroll-driven camera walks around the product, and an exploded view shows how it is built.",
  },
  audio: {
    label: "audio product",
    direction: "cinematic-dark",
    modelId: "headphones",
    placement: "product-showcase",
    lighting: "moody-rim",
    material: "satin-plastic",
    framing: "three-quarter",
    intensity: "balanced",
    scrollCamera: true,
    exploded: true,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: true,
    sections: ["hero", "object-showcase", "exploded-view", "features", "faq", "cta"],
    why: "Dark, cinematic staging suits audio; an exploded view of cups and cushions makes the engineering tangible.",
  },
  architecture: {
    label: "architecture or interiors portfolio",
    direction: "minimal-editorial",
    modelId: "pavilion",
    placement: "dedicated-section",
    lighting: "daylight",
    material: "matte-clay",
    framing: "wide",
    intensity: "subtle",
    scrollCamera: true,
    exploded: false,
    particles: false,
    horizontal: true,
    pinned: false,
    smoothScroll: true,
    sections: ["hero", "gallery", "abstract-scene", "horizontal-cases", "contact"],
    why: "Spatial transitions, large imagery and restrained typography let projects speak; a clay-rendered pavilion adds a calm spatial moment.",
  },
  saas: {
    label: "SaaS product",
    direction: "clean-technology",
    modelId: "liquid-orb",
    placement: "hero",
    lighting: "studio",
    material: "iridescent",
    framing: "three-quarter",
    intensity: "balanced",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: false,
    sections: ["hero", "features", "pinned-story", "pricing", "faq", "cta"],
    why: "An interactive abstract scene signals technology without hiding the message; readable feature, pricing and FAQ sections do the selling.",
  },
  app: {
    label: "mobile app",
    direction: "clean-technology",
    modelId: "smartphone",
    placement: "hero",
    lighting: "studio",
    material: "brushed-metal",
    framing: "three-quarter",
    intensity: "balanced",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: false,
    sections: ["hero", "pinned-story", "features", "faq", "cta"],
    why: "A device in the hero shows the product immediately; pinned storytelling walks through the key flows step by step.",
  },
  gaming: {
    label: "game launch",
    direction: "futuristic",
    modelId: "crystal-cluster",
    placement: "hero",
    lighting: "neon-dual",
    material: "iridescent",
    framing: "low-angle",
    intensity: "dramatic",
    scrollCamera: true,
    exploded: false,
    particles: true,
    horizontal: true,
    pinned: true,
    smoothScroll: true,
    sections: ["hero", "kinetic-type", "pinned-story", "horizontal-cases", "faq", "cta"],
    why: "Stronger motion, particles and neon atmosphere build anticipation; a low camera angle makes the hero object feel monumental.",
  },
  fashion: {
    label: "fashion brand",
    direction: "brutalist",
    modelId: "monolith-stack",
    placement: "background",
    lighting: "daylight",
    material: "matte-clay",
    framing: "wide",
    intensity: "balanced",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: true,
    pinned: false,
    smoothScroll: true,
    sections: ["hero", "kinetic-type", "gallery", "horizontal-cases", "contact"],
    why: "Graphic type and an editorial gallery put the collection first; horizontal scrolling feels like flipping through a lookbook.",
  },
  agency: {
    label: "agency or studio",
    direction: "cinematic-dark",
    modelId: "torus-knot",
    placement: "hero",
    lighting: "moody-rim",
    material: "chrome",
    framing: "three-quarter",
    intensity: "balanced",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: true,
    pinned: false,
    smoothScroll: true,
    sections: ["hero", "kinetic-type", "horizontal-cases", "features", "contact"],
    why: "A sculptural object signals craft, kinetic type sets the tone, and horizontal case studies make the work easy to browse.",
  },
  portfolio: {
    label: "personal portfolio",
    direction: "minimal-editorial",
    modelId: "torus-knot",
    placement: "background",
    lighting: "gallery",
    material: "ceramic",
    framing: "wide",
    intensity: "subtle",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: true,
    pinned: false,
    smoothScroll: false,
    sections: ["hero", "gallery", "horizontal-cases", "contact"],
    why: "Keep the focus on the work: editorial typography, a quiet background object and a browsable case-study rail.",
  },
  event: {
    label: "event",
    direction: "futuristic",
    modelId: "wave-field",
    placement: "background",
    lighting: "neon-dual",
    material: "auto",
    framing: "wide",
    intensity: "balanced",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: false,
    pinned: false,
    smoothScroll: false,
    sections: ["hero", "kinetic-type", "specs", "features", "faq", "cta"],
    why: "An animated wave field gives energy behind the content while dates, venue and FAQs stay easy to scan.",
  },
  fintech: {
    label: "fintech product",
    direction: "clean-technology",
    modelId: "monolith-stack",
    placement: "hero",
    lighting: "studio",
    material: "brushed-metal",
    framing: "three-quarter",
    intensity: "subtle",
    scrollCamera: false,
    exploded: true,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: false,
    sections: ["hero", "features", "exploded-view", "pricing", "faq", "cta"],
    why: "Layered slabs suggest a secure, structured platform; subtle motion keeps the tone trustworthy.",
  },
  generic: {
    label: "product launch",
    direction: "cinematic-dark",
    modelId: "torus-knot",
    placement: "hero",
    lighting: "moody-rim",
    material: "chrome",
    framing: "three-quarter",
    intensity: "balanced",
    scrollCamera: false,
    exploded: false,
    particles: false,
    horizontal: false,
    pinned: true,
    smoothScroll: true,
    sections: ["hero", "pinned-story", "features", "faq", "cta"],
    why: "A cinematic hero object with a clear story and features section is a strong, safe default.",
  },
};

export function detectIndustry(input: RecommendationInput): Industry {
  const purposeIndustry = PURPOSE_TO_INDUSTRY[input.config.purpose];
  const text = [input.prompt, input.config.brand.description, input.config.brand.audience].join(" ");
  for (const [industry, re] of KEYWORDS) {
    if (re.test(text)) return industry;
  }
  return purposeIndustry ?? "generic";
}

export function profileFor(industry: Industry): Profile {
  return { industry, ...PROFILES[industry] };
}

/** The profile adjusted to the user's assets (uploaded model wins over catalog). */
export function resolveProfile(input: RecommendationInput): Profile {
  const p = profileFor(detectIndustry(input));
  const uploaded = input.assets.find((a) => a.kind === "model");
  if (uploaded && !uploaded.meta.separable) p.exploded = false;
  if (!uploaded && !getModel(p.modelId)?.separable) p.exploded = false;
  if (p.exploded && !p.sections.includes("exploded-view")) p.sections = [...p.sections.slice(0, -1), "exploded-view", p.sections[p.sections.length - 1]];
  if (!p.exploded) p.sections = p.sections.filter((s) => s !== "exploded-view");
  const images = input.assets.filter((a) => a.kind === "image");
  if (images.length >= 3 && !p.sections.includes("gallery")) p.sections = [...p.sections.slice(0, 2), "gallery", ...p.sections.slice(2)];
  return p;
}

function heavyEffects(config: WebsiteConfig): number {
  const m = config.motion;
  return [m.smoothScroll, m.pinnedSections, m.scrollCamera || config.scene.scrollCamera, m.parallax, m.horizontalSections, m.particles, m.customCursor, m.imageTransitions].filter(Boolean).length;
}

export function recommend(input: RecommendationInput): Recommendation[] {
  const { config, assets } = input;
  const p = resolveProfile(input);
  const recs: Recommendation[] = [];
  const uploadedModel = assets.find((a) => a.kind === "model");
  const modelName = uploadedModel ? "your uploaded model" : (getModel(p.modelId)?.name.toLowerCase() ?? "a 3D object");

  recs.push({
    id: `look-${p.industry}`,
    title: `${titleCase(p.direction)} look with ${uploadedModel ? "your model" : modelName}`,
    explanation: `For a ${p.label}: ${p.why}`,
    patch: {
      direction: p.direction,
      scene: {
        enabled: true,
        subject: uploadedModel ? "uploaded" : (getModel(p.modelId)?.category === "abstract" ? "abstract" : getModel(p.modelId)?.category === "architecture" ? "architecture" : getModel(p.modelId)?.category === "gaming" ? "gaming" : "product"),
        modelId: uploadedModel ? null : p.modelId,
        uploadedModelAssetId: uploadedModel ? uploadedModel.id : null,
        placement: p.placement,
        lighting: p.lighting,
        material: uploadedModel ? "auto" : p.material,
        framing: p.framing,
        scrollCamera: p.scrollCamera,
        explodedView: p.exploded,
      },
    },
    preview: { kind: "direction", directionId: p.direction, modelId: uploadedModel ? undefined : p.modelId },
    touches: ["direction", "scene.subject", "scene.modelId", "scene.placement", "scene.lighting", "scene.material", "scene.framing", "scene.scrollCamera", "scene.explodedView"],
    confidence: p.industry === "generic" ? 0.55 : 0.85,
    source: "rules",
  });

  recs.push({
    id: `motion-${p.intensity}`,
    title: `${titleCase(p.intensity)} motion`,
    explanation:
      p.intensity === "dramatic"
        ? "Bigger reveals, faster marquees and particles create energy. Mobile automatically gets a lighter version."
        : p.intensity === "subtle"
          ? "Short, soft reveals keep attention on content and imagery. Effects that compete with the subject stay off."
          : "Noticeable but calm motion: text reveals, staggered entrances and a pinned story section.",
    patch: {
      motion: {
        intensity: p.intensity,
        smoothScroll: p.smoothScroll,
        pinnedSections: p.pinned,
        scrollCamera: p.scrollCamera,
        horizontalSections: p.horizontal,
        particles: p.particles,
        textReveals: true,
        staggeredEntrances: true,
        parallax: p.intensity !== "subtle",
        imageTransitions: p.sections.includes("gallery"),
        customCursor: p.intensity === "dramatic",
        sectionTransition: p.intensity === "dramatic" ? "clip-reveal" : p.intensity === "subtle" ? "fade" : "slide-up",
      },
    },
    preview: { kind: "motion" },
    touches: ["motion"],
    confidence: 0.7,
    source: "rules",
  });

  recs.push({
    id: `sections-${p.industry}`,
    title: "Suggested page structure",
    explanation: `${p.sections.length} sections in this order: ${p.sections.map(sectionName).join(" → ")}.`,
    patch: { brand: { sectionsMode: "custom", sections: p.sections } },
    preview: { kind: "sections" },
    touches: ["brand.sections", "brand.sectionsMode"],
    confidence: 0.65,
    source: "rules",
  });

  if (uploadedModel) {
    recs.push({
      id: "asset-model",
      title: uploadedModel.meta.separable ? "Use your model with an exploded view" : "Feature your uploaded model",
      explanation: uploadedModel.meta.separable
        ? `Your model has ${uploadedModel.meta.meshCount ?? "several"} separate parts, so it can separate on scroll to show its construction.`
        : "Your model is a single surface, so it will turn and react to scroll; exploded view is not available for it.",
      patch: { scene: { enabled: true, subject: "uploaded", uploadedModelAssetId: uploadedModel.id, modelId: null, explodedView: Boolean(uploadedModel.meta.separable), material: "auto" } },
      preview: { kind: "asset", assetId: uploadedModel.id },
      touches: ["scene.subject", "scene.uploadedModelAssetId", "scene.modelId", "scene.explodedView", "scene.material"],
      confidence: 0.9,
      source: "rules",
    });
  }

  const images = assets.filter((a) => a.kind === "image");
  if (images.length >= 2 && !config.brand.sections.includes("gallery")) {
    recs.push({
      id: "asset-gallery",
      title: "Show your images in an editorial gallery",
      explanation: `You uploaded ${images.length} images. A gallery with image transitions presents them at full quality.`,
      patch: { brand: { imageAssetIds: images.map((i) => i.id).slice(0, 24) }, motion: { imageTransitions: true } },
      preview: { kind: "asset", assetId: images[0].id },
      touches: ["brand.imageAssetIds", "motion.imageTransitions"],
      confidence: 0.75,
      source: "rules",
    });
  }

  const logo = assets.find((a) => a.kind === "logo" && a.meta.dominantColor);
  if (logo && config.brand.colors.mode === "auto") {
    recs.push({
      id: "asset-logo-color",
      title: "Use your logo color as the accent",
      explanation: `Your logo's dominant color (${logo.meta.dominantColor}) becomes the accent for buttons, highlights and 3D lighting.`,
      patch: { brand: { logoAssetId: logo.id, colors: { mode: "custom", primary: logo.meta.dominantColor } } },
      preview: { kind: "asset", assetId: logo.id },
      touches: ["brand.logoAssetId", "brand.colors"],
      confidence: 0.7,
      source: "rules",
    });
  }

  const heavy = heavyEffects(config);
  if (config.scene.enabled && (heavy >= 5 || config.scene.quality === "high" || config.output.prioritizePerformance)) {
    recs.push({
      id: "perf-mobile",
      title: "Keep mobile fast",
      explanation:
        heavy >= 5
          ? `${heavy} motion effects are on. On phones, simplified 3D at low quality with reduced effects keeps scrolling smooth.`
          : "Simplified 3D on phones caps resolution and particle counts, which keeps scrolling smooth on mid-range devices.",
      patch: { scene: { mobile: "simplified", quality: "auto" }, motion: { customCursor: false } },
      preview: { kind: "performance" },
      touches: ["scene.mobile", "scene.quality", "motion.customCursor"],
      confidence: 0.6,
      source: "rules",
    });
  }

  if (config.output.format === "single-html" && (uploadedModel?.sizeBytes ?? 0) + images.reduce((n, i) => n + i.sizeBytes, 0) > 8 * 1024 * 1024) {
    recs.push({
      id: "export-zip",
      title: "Export as ZIP",
      explanation: "Your assets are large. A ZIP keeps the HTML small and loads images and models as separate files, which is faster for visitors.",
      patch: { output: { format: "zip" } },
      preview: { kind: "performance" },
      touches: ["output.format"],
      confidence: 0.7,
      source: "rules",
    });
  }

  return recs;
}

/** Fill "auto" values in a config using the rule profile, without touching explicit choices. */
export function resolveAutoConfig(input: RecommendationInput): WebsiteConfig {
  const c = structuredClone(input.config);
  const p = resolveProfile(input);
  if (c.direction === "auto") c.direction = p.direction;
  if (c.motion.intensity === "auto") c.motion.intensity = p.intensity;
  if (c.motion.sectionTransition === "auto") c.motion.sectionTransition = p.intensity === "dramatic" ? "clip-reveal" : p.intensity === "subtle" ? "fade" : "slide-up";
  if (c.scene.placement === "auto") c.scene.placement = p.placement;
  if (c.scene.lighting === "auto") c.scene.lighting = p.lighting;
  if (c.scene.framing === "auto") c.scene.framing = p.framing;
  if (c.scene.quality === "auto") c.scene.quality = c.output.prioritizePerformance ? "medium" : "high";
  if (c.scene.subject === "uploaded" && !c.scene.uploadedModelAssetId) {
    const uploaded = input.assets.find((a) => a.kind === "model");
    if (uploaded) c.scene.uploadedModelAssetId = uploaded.id;
    else c.scene.subject = "auto";
  }
  if (c.scene.subject !== "uploaded" && !c.scene.modelId) {
    const bySubject: Record<string, string> = { abstract: "liquid-orb", architecture: "pavilion", gaming: "crystal-cluster" };
    const profileCategory = getModel(p.modelId)?.category;
    if (bySubject[c.scene.subject]) c.scene.modelId = profileCategory === c.scene.subject ? p.modelId : bySubject[c.scene.subject];
    else if (c.scene.subject === "product" && profileCategory !== "product") c.scene.modelId = "perfume-bottle";
    else c.scene.modelId = p.modelId;
  }
  if (c.brand.sectionsMode === "auto" || c.brand.sections.length === 0) c.brand.sections = p.sections;
  return c;
}

export function sectionName(type: SectionType): string {
  const names: Record<SectionType, string> = {
    hero: "Hero",
    "object-showcase": "Scroll showcase",
    "pinned-story": "Pinned story",
    "exploded-view": "Exploded view",
    features: "Features",
    "kinetic-type": "Animated type",
    gallery: "Gallery",
    "horizontal-cases": "Horizontal cases",
    "abstract-scene": "Interactive scene",
    specs: "Details",
    pricing: "Pricing",
    faq: "FAQ",
    cta: "Closing CTA",
    contact: "Contact",
    "scroll-film": "Scroll film",
  };
  return names[type];
}

function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ALL_MODEL_IDS = MODELS.map((m) => m.id);
