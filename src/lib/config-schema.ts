import { z } from "zod";

/**
 * User-facing website configuration. Every control in the configuration panel
 * maps to a field here. "auto" values are resolved by the recommendation
 * rules and the spec normalizer, never left ambiguous in the final spec.
 */

export const PURPOSES = [
  { id: "auto", name: "Auto — recommended" },
  { id: "product-launch", name: "Product launch" },
  { id: "saas", name: "SaaS landing page" },
  { id: "agency", name: "Agency" },
  { id: "portfolio", name: "Personal portfolio" },
  { id: "architecture", name: "Architecture" },
  { id: "fashion", name: "Fashion" },
  { id: "luxury", name: "Luxury brand" },
  { id: "gaming", name: "Gaming" },
  { id: "event", name: "Event" },
  { id: "other", name: "Other" },
] as const;

export const SECTION_TYPES = [
  { id: "hero", name: "Hero", description: "Opening statement with the main call to action." },
  { id: "object-showcase", name: "Scroll-controlled object", description: "Pinned 3D object that turns as captions scroll by.", requires3d: true },
  { id: "pinned-story", name: "Pinned storytelling", description: "A pinned panel that steps through a narrative." },
  { id: "exploded-view", name: "Exploded view", description: "Separates the model into labeled parts on scroll.", requires3d: true, requiresSeparable: true },
  { id: "features", name: "Features", description: "Readable grid of capabilities or benefits." },
  { id: "kinetic-type", name: "Animated typography", description: "Large moving type band for rhythm and emphasis." },
  { id: "gallery", name: "Editorial gallery", description: "Image grid with captions." },
  { id: "horizontal-cases", name: "Horizontal case studies", description: "Cards that travel sideways as you scroll." },
  { id: "abstract-scene", name: "Interactive scene", description: "Full-bleed interactive 3D interlude.", requires3d: true },
  { id: "specs", name: "Details / specifications", description: "Key facts you provide, in a clean table." },
  { id: "pricing", name: "Pricing", description: "Plan cards linking to your checkout or contact." },
  { id: "faq", name: "FAQ", description: "Accessible expandable questions." },
  { id: "cta", name: "Closing call to action", description: "Strong final prompt to act." },
  { id: "contact", name: "Contact", description: "Email link or your configured form endpoint." },
  { id: "scroll-film", name: "Scroll film", description: "A pre-rendered cinematic sequence scrubbed by scroll (sample sites).", requiresFilm: true },
] as const;

export type SectionType = (typeof SECTION_TYPES)[number]["id"];
export const SECTION_TYPE_IDS = SECTION_TYPES.map((s) => s.id) as [SectionType, ...SectionType[]];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #1A2B3C");
const assetId = z.string().uuid();

export const SceneConfigSchema = z.object({
  enabled: z.boolean(),
  subject: z.enum(["auto", "product", "abstract", "architecture", "gaming", "uploaded"]),
  /** Catalog model id, or null for auto. */
  modelId: z.string().max(64).nullable(),
  /** Uploaded GLB/glTF asset id when subject === "uploaded". */
  uploadedModelAssetId: assetId.nullable(),
  placement: z.enum(["auto", "hero", "background", "product-showcase", "dedicated-section"]),
  material: z.string().max(32),
  lighting: z.string().max(32),
  framing: z.string().max(32),
  autoRotate: z.boolean(),
  pointerInteraction: z.boolean(),
  scrollCamera: z.boolean(),
  explodedView: z.boolean(),
  quality: z.enum(["auto", "low", "medium", "high"]),
  mobile: z.enum(["simplified", "static-fallback", "disabled"]),
});

export const MotionConfigSchema = z.object({
  intensity: z.enum(["auto", "subtle", "balanced", "dramatic"]),
  smoothScroll: z.boolean(),
  pinnedSections: z.boolean(),
  scrollCamera: z.boolean(),
  parallax: z.boolean(),
  horizontalSections: z.boolean(),
  textReveals: z.boolean(),
  staggeredEntrances: z.boolean(),
  imageTransitions: z.boolean(),
  particles: z.boolean(),
  hoverInteractions: z.boolean(),
  customCursor: z.boolean(),
  sectionTransition: z.enum(["auto", "fade", "slide-up", "clip-reveal", "none"]),
});

export const BrandConfigSchema = z.object({
  brandName: z.string().max(80),
  description: z.string().max(600),
  audience: z.string().max(300),
  primaryCta: z.string().max(60),
  primaryCtaUrl: z.string().max(500),
  logoAssetId: assetId.nullable(),
  colors: z.object({
    mode: z.enum(["auto", "custom"]),
    primary: hex,
    secondary: hex,
    background: hex,
  }),
  fontPairing: z.string().max(40),
  language: z.string().min(2).max(12),
  sections: z.array(z.enum(SECTION_TYPE_IDS)).max(14),
  sectionsMode: z.enum(["auto", "custom"]),
  imageAssetIds: z.array(assetId).max(24),
  referenceAssetId: assetId.nullable(),
});

export const OutputConfigSchema = z.object({
  format: z.enum(["single-html", "zip"]),
  seoTitle: z.string().max(70),
  seoDescription: z.string().max(170),
  faviconAssetId: assetId.nullable(),
  socialImageAssetId: assetId.nullable(),
  contactEmail: z.string().max(200),
  formEndpoint: z.string().max(500),
  prioritizeAccessibility: z.boolean(),
  prioritizePerformance: z.boolean(),
});

export const WebsiteConfigSchema = z.object({
  purpose: z.enum(PURPOSES.map((p) => p.id) as [string, ...string[]]),
  direction: z.enum([
    "auto",
    "cinematic-dark",
    "minimal-editorial",
    "futuristic",
    "luxury",
    "playful",
    "brutalist",
    "clean-technology",
    "custom",
  ]),
  scene: SceneConfigSchema,
  motion: MotionConfigSchema,
  brand: BrandConfigSchema,
  output: OutputConfigSchema,
});

export type WebsiteConfig = z.infer<typeof WebsiteConfigSchema>;
export type SceneConfig = z.infer<typeof SceneConfigSchema>;
export type MotionConfig = z.infer<typeof MotionConfigSchema>;

export const DEFAULT_CONFIG: WebsiteConfig = {
  purpose: "auto",
  direction: "auto",
  scene: {
    enabled: true,
    subject: "auto",
    modelId: null,
    uploadedModelAssetId: null,
    placement: "auto",
    material: "auto",
    lighting: "auto",
    framing: "auto",
    autoRotate: true,
    pointerInteraction: true,
    scrollCamera: false,
    explodedView: false,
    quality: "auto",
    mobile: "simplified",
  },
  motion: {
    intensity: "auto",
    smoothScroll: false,
    pinnedSections: true,
    scrollCamera: false,
    parallax: true,
    horizontalSections: false,
    textReveals: true,
    staggeredEntrances: true,
    imageTransitions: false,
    particles: false,
    hoverInteractions: true,
    customCursor: false,
    sectionTransition: "auto",
  },
  brand: {
    brandName: "",
    description: "",
    audience: "",
    primaryCta: "",
    primaryCtaUrl: "",
    logoAssetId: null,
    colors: { mode: "auto", primary: "#F2B84B", secondary: "#60A5FA", background: "#0B0B0D" },
    fontPairing: "auto",
    language: "en",
    sections: [],
    sectionsMode: "auto",
    imageAssetIds: [],
    referenceAssetId: null,
  },
  output: {
    format: "zip",
    seoTitle: "",
    seoDescription: "",
    faviconAssetId: null,
    socialImageAssetId: null,
    contactEmail: "",
    formEndpoint: "",
    prioritizeAccessibility: true,
    prioritizePerformance: true,
  },
};

/** Deep-merge a partial config over a base, validating the result. */
export function mergeConfig(base: WebsiteConfig, patch: DeepPartial<WebsiteConfig>): WebsiteConfig {
  const merged = deepMerge(base, patch) as WebsiteConfig;
  return WebsiteConfigSchema.parse(merged);
}

/** Parse untrusted stored config, filling any missing fields from defaults. */
export function coerceConfig(input: unknown): WebsiteConfig {
  const merged = deepMerge(DEFAULT_CONFIG, (input ?? {}) as DeepPartial<WebsiteConfig>);
  const parsed = WebsiteConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}

export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : patch) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (base as Record<string, unknown>)[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return out as T;
}

/**
 * Detect incompatible combinations and return human-readable warnings plus a
 * corrected config. Used by the panel (to explain) and the normalizer (to fix).
 */
export function resolveConflicts(config: WebsiteConfig, opts: { modelSeparable: boolean | null }) {
  const notes: string[] = [];
  const c: WebsiteConfig = structuredClone(config);

  if (!c.scene.enabled) {
    if (c.scene.scrollCamera || c.motion.scrollCamera) notes.push("Scroll-driven camera needs 3D; it is off while 3D is disabled.");
    if (c.scene.explodedView) notes.push("Exploded view needs 3D; it is off while 3D is disabled.");
    c.scene.scrollCamera = false;
    c.motion.scrollCamera = false;
    c.scene.explodedView = false;
  }
  if (c.scene.explodedView && opts.modelSeparable === false) {
    notes.push("The selected model is a single surface, so exploded view is unavailable.");
    c.scene.explodedView = false;
  }
  // Keep the two scroll-camera switches in sync (one lives in 3D, one in motion).
  const scrollCam = c.scene.scrollCamera || c.motion.scrollCamera;
  c.scene.scrollCamera = scrollCam && c.scene.enabled;
  c.motion.scrollCamera = c.scene.scrollCamera;

  if (c.motion.horizontalSections && c.motion.intensity === "subtle") {
    notes.push("Horizontal scrolling feels abrupt with subtle motion; consider Balanced.");
  }
  if (c.motion.smoothScroll && c.motion.horizontalSections && c.motion.pinnedSections && c.motion.particles && c.motion.customCursor) {
    notes.push("Many heavy effects are on at once. Consider turning one off for smoother mobile performance.");
  }
  if (c.scene.quality === "high" && c.scene.mobile === "simplified" && c.motion.particles) {
    notes.push("Particles are reduced automatically on mobile.");
  }
  return { config: c, notes };
}
