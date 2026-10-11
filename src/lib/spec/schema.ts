import { z } from "zod";
import { SECTION_TYPE_IDS } from "@/lib/config-schema";

/**
 * The design specification is the contract between planning (AI or rules)
 * and assembly. The assembler renders only what this schema allows, so the
 * AI never writes raw HTML or JavaScript.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const safeText = (max: number) => z.string().max(max);
/** Links in generated sites: http(s), mailto, tel, or in-page anchors only. */
export const SafeHref = z
  .string()
  .max(500)
  .refine((v) => /^(https?:\/\/|mailto:|tel:|#)/i.test(v) && !/^\s*javascript:/i.test(v), "Unsupported link");

export const PaletteSchema = z.object({
  background: hex,
  surface: hex,
  text: hex,
  muted: hex,
  accent: hex,
  accent2: hex,
});
export type Palette = z.infer<typeof PaletteSchema>;

export const SectionItemSchema = z.object({
  title: safeText(140),
  body: safeText(700).optional(),
  meta: safeText(80).optional(),
  imageAssetId: z.string().uuid().optional(),
  href: SafeHref.optional(),
});

export const SectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  type: z.enum(SECTION_TYPE_IDS),
  eyebrow: safeText(60).optional(),
  heading: safeText(160),
  body: safeText(900).optional(),
  items: z.array(SectionItemSchema).max(12).optional(),
  cta: z.object({ label: safeText(48), href: SafeHref }).optional(),
  imageAssetIds: z.array(z.string().uuid()).max(12).optional(),
  /** Layout variant within a section type (e.g. "split", "centered"). */
  variant: z.enum(["default", "centered", "split", "minimal"]).default("default"),
  /** scroll-film only: id from src/lib/catalog/films.ts (never a raw path). */
  filmId: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
});
export type Section = z.infer<typeof SectionSchema>;
export type SectionItem = z.infer<typeof SectionItemSchema>;

export const SceneSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("catalog"), modelId: z.string() }),
  z.object({ type: z.literal("upload"), assetId: z.string().uuid(), separable: z.boolean() }),
]);

export const SceneSpecSchema = z.object({
  enabled: z.boolean(),
  source: SceneSourceSchema,
  placement: z.enum(["hero", "background", "product-showcase", "dedicated-section"]),
  material: z.string(),
  lighting: z.string(),
  framing: z.enum(["hero-close", "three-quarter", "wide", "low-angle"]),
  autoRotate: z.boolean(),
  pointer: z.boolean(),
  scrollCamera: z.boolean(),
  exploded: z.boolean(),
  quality: z.enum(["low", "medium", "high"]),
  mobile: z.enum(["simplified", "static-fallback", "disabled"]),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

export const MotionSpecSchema = z.object({
  intensity: z.enum(["subtle", "balanced", "dramatic"]),
  smoothScroll: z.boolean(),
  pinned: z.boolean(),
  parallax: z.boolean(),
  horizontal: z.boolean(),
  textReveals: z.boolean(),
  stagger: z.boolean(),
  imageTransitions: z.boolean(),
  particles: z.boolean(),
  hover: z.boolean(),
  cursor: z.boolean(),
  transition: z.enum(["fade", "slide-up", "clip-reveal", "none"]),
  /** Reduce effects below 768px wide. */
  reduceOnMobile: z.boolean(),
});
export type MotionSpec = z.infer<typeof MotionSpecSchema>;

export const DesignSpecSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    title: safeText(70),
    description: safeText(170),
    lang: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  }),
  brand: z.object({
    name: safeText(80),
    tagline: safeText(140),
    logoAssetId: z.string().uuid().nullable(),
    cta: z.object({ label: safeText(48), href: SafeHref }),
  }),
  direction: z.string(),
  palette: PaletteSchema,
  typography: z.object({
    display: z.string(),
    body: z.string(),
    scale: z.enum(["compact", "standard", "large"]),
    displayCase: z.enum(["none", "uppercase"]),
  }),
  radius: z.number().int().min(0).max(32),
  scene: SceneSpecSchema,
  motion: MotionSpecSchema,
  sections: z.array(SectionSchema).min(2).max(14),
  assets: z.object({
    faviconAssetId: z.string().uuid().nullable(),
    socialImageAssetId: z.string().uuid().nullable(),
    /** Alt text for every uploaded image used in the site. */
    imageAlts: z.record(z.string().uuid(), safeText(200)),
  }),
  integrations: z.object({
    contactEmail: z.string().max(200),
    formEndpoint: z.string().max(500),
  }),
  /** Short notes from the planner, shown in the chat (not rendered in the site). */
  notes: z.array(safeText(300)).max(8),
});
export type DesignSpec = z.infer<typeof DesignSpecSchema>;

const AIImageryField = z
  .array(
    z.object({
      key: z.string().describe("Short id like 'hero' or 'story-1'; reference it in sections as 'gen:<key>'"),
      prompt: z.string().describe("Detailed art-directed image prompt: subject, setting, camera, lens, light, mood, palette"),
      alt: z.string().describe("Alt text describing the image"),
      aspect: z.enum(["landscape", "portrait", "square"]),
    }),
  )
  .describe("New images to generate (at most image_budget). Also give alt text for each uploaded image you use: an entry with key = its asset id, prompt '' and the alt.");

const AIReplyField = z
  .string()
  .describe(
    "Your chat message to the user, shown after this version is saved: natural, specific and brief (2-5 sentences). Say what you did and why, answer anything they asked, and mention what they could try next. No bullet lists of settings, no model or vendor names.",
  );

/**
 * Looser schema used for AI structured output. It keeps the same shape but
 * avoids constraints that structured-output JSON Schema handles poorly
 * (regex, max lengths). The normalizer clamps and repairs everything into a
 * strict `DesignSpec`.
 */
export const AIPlanSchema = z.object({
  title: z.string().describe("SEO title, under 60 characters"),
  description: z.string().describe("Meta description, under 160 characters"),
  brandName: z.string(),
  tagline: z.string(),
  ctaLabel: z.string(),
  direction: z.enum([
    "cinematic-dark",
    "minimal-editorial",
    "futuristic",
    "luxury",
    "playful",
    "brutalist",
    "clean-technology",
    "custom",
  ]),
  palette: z.object({
    background: z.string(),
    surface: z.string(),
    text: z.string(),
    muted: z.string(),
    accent: z.string(),
    accent2: z.string(),
  }),
  displayFont: z.string(),
  bodyFont: z.string(),
  typeScale: z.enum(["compact", "standard", "large"]),
  scene: z.object({
    enabled: z.boolean(),
    modelId: z.string().describe("A catalog model id, or 'uploaded' to use the user's model"),
    placement: z.enum(["hero", "background", "product-showcase", "dedicated-section"]),
    material: z.string(),
    lighting: z.string(),
    framing: z.enum(["hero-close", "three-quarter", "wide", "low-angle"]),
    autoRotate: z.boolean(),
    pointer: z.boolean(),
    scrollCamera: z.boolean(),
    exploded: z.boolean(),
    quality: z.enum(["low", "medium", "high"]),
    mobile: z.enum(["simplified", "static-fallback", "disabled"]).describe("3D behavior on phones"),
  }),
  motion: z.object({
    intensity: z.enum(["subtle", "balanced", "dramatic"]),
    smoothScroll: z.boolean(),
    pinned: z.boolean(),
    parallax: z.boolean(),
    horizontal: z.boolean(),
    textReveals: z.boolean(),
    stagger: z.boolean(),
    imageTransitions: z.boolean(),
    particles: z.boolean(),
    hover: z.boolean(),
    cursor: z.boolean(),
    transition: z.enum(["fade", "slide-up", "clip-reveal", "none"]),
  }),
  sections: z.array(
    z.object({
      type: z.enum(SECTION_TYPE_IDS),
      eyebrow: z.string().optional(),
      heading: z.string(),
      body: z.string().optional(),
      variant: z.enum(["default", "centered", "split", "minimal"]).optional(),
      items: z
        .array(
          z.object({
            title: z.string(),
            body: z.string().optional(),
            meta: z.string().optional(),
            imageAssetId: z.string().optional(),
          }),
        )
        .optional(),
      ctaLabel: z.string().optional(),
      imageAssetIds: z.array(z.string()).optional(),
      filmId: z.string().optional().describe("Only for scroll-film sections; leave empty"),
    }),
  ),
  imageAlts: z.array(z.object({ assetId: z.string(), alt: z.string() })),
  imagery: AIImageryField.optional(),
  notes: z.array(z.string()).describe("2-4 short plain-English notes about the choices made"),
  reply: AIReplyField.optional(),
});
export type AIPlan = z.infer<typeof AIPlanSchema>;

/**
 * The exact schema sent to the AI for structured output. Structured-output
 * grammars have a size limit and every optional field multiplies it, so this
 * drops internal-only fields (filmId: samples only) and makes the AI's own
 * fields required (an empty list / string when unused). Its output is a valid
 * AIPlan.
 */
const AISectionOutputSchema = z.object({
  type: z.enum(SECTION_TYPE_IDS),
  eyebrow: z.string().describe("Empty string for none"),
  heading: z.string(),
  body: z.string().describe("Empty string for none"),
  variant: z.enum(["default", "centered", "split", "minimal"]),
  items: z.array(
    z.object({
      title: z.string(),
      body: z.string().describe("Empty string for none"),
      meta: z.string().describe("Empty string for none"),
      imageAssetId: z.string().describe("Asset id or 'gen:<key>'; empty string for none"),
    }),
  ),
  ctaLabel: z.string().describe("Empty string for none"),
  imageAssetIds: z.array(z.string()),
});
export const AIPlanOutputSchema = AIPlanSchema.omit({ sections: true, imagery: true, reply: true, imageAlts: true }).extend({
  sections: z.array(AISectionOutputSchema),
  imagery: AIImageryField,
  reply: AIReplyField,
});

export type AIPlanOutput = z.infer<typeof AIPlanOutputSchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Converts the AI's compact output into an AIPlan (alt-text-only imagery entries become imageAlts). */
export function planFromOutput(out: AIPlanOutput): AIPlan {
  const isAlt = (i: { key: string; prompt: string }) => UUID.test(i.key.trim()) && !i.prompt.trim();
  return {
    ...out,
    imageAlts: out.imagery.filter(isAlt).map((i) => ({ assetId: i.key.trim(), alt: i.alt })),
    imagery: out.imagery.filter((i) => !isAlt(i)),
  };
}
