import { DEFAULT_CONFIG, mergeConfig, type DeepPartial, type WebsiteConfig } from "@/lib/config-schema";
import { normalizePlan } from "@/lib/spec/normalize";
import { getDirection } from "@/lib/catalog/directions";
import type { AIPlan, DesignSpec } from "@/lib/spec/schema";
import type { AssetSummary } from "@/lib/recommend/engine";

/**
 * Sample projects for fictional brands, built with the same pipeline as user
 * sites (plan → normalize → assemble). Shown on the landing page and clearly
 * labeled as samples — not customer work.
 */

export interface Example {
  slug: string;
  name: string;
  brief: string;
  directionLabel: string;
  highlights: string[];
  spec: DesignSpec;
}

type Section = AIPlan["sections"][number];

function plan(p: Omit<AIPlan, "palette" | "displayFont" | "bodyFont" | "imageAlts" | "notes"> & { palette?: AIPlan["palette"] }): AIPlan {
  const d = getDirection(p.direction);
  return { ...p, palette: p.palette ?? d.palette, displayFont: d.fonts.display, bodyFont: d.fonts.body, imageAlts: [], notes: [] };
}

/**
 * Sample imagery: stills taken from each sample's pre-rendered film
 * (public/samples/<slug>/<n>.webp), registered with stable ids so they pass
 * through the same validation as user uploads.
 */
const IMAGE_FILES: Record<string, { slug: string; n: number; alt: string }> = {};
function img(slug: string, n: number, alt: string): string {
  const id = `5a3e${String(slug.length).padStart(4, "0")}-0000-4000-8000-${String(slug.charCodeAt(0) * 100 + n).padStart(12, "0")}`;
  IMAGE_FILES[id] = { slug, n, alt };
  return id;
}

export function exampleAssetUrl(id: string): string | null {
  const f = IMAGE_FILES[id];
  return f ? `/samples/${f.slug}/${f.n}.webp` : null;
}

function build(brief: string, cfg: DeepPartial<WebsiteConfig>, p: AIPlan, imageIds: string[] = []): DesignSpec {
  const config = mergeConfig(DEFAULT_CONFIG, cfg);
  const assets: AssetSummary[] = imageIds.map((id) => ({ id, kind: "image", name: IMAGE_FILES[id].alt, sizeBytes: 80_000, meta: { width: 1400, height: 788 } }));
  const plan = { ...p, imageAlts: imageIds.map((id) => ({ assetId: id, alt: IMAGE_FILES[id].alt })) };
  return normalizePlan({ plan, config, assets, prompt: brief, prefer: "plan" }).spec;
}

const N = [1, 2, 3, 4].map((n) => img("nocturne", n, ["Gold cap of the Nocturne flacon from above", "The flacon in warm light", "Amber liquid through faceted glass", "Nocturne at rest"][n - 1]));
const H = [1, 2, 3, 4].map((n) => img("halcyon", n, ["Halcyon One headphones", "Ear cups and headband", "Parts separated: cushions, cups and band", "Halcyon One reassembled"][n - 1]));
const S = [1, 2, 3, 4].map((n) => img("shardfall", n, ["A field of glowing crystal", "Crystal clusters at dusk", "The heart crystal", "Neon shards"][n - 1]));
const A = [1, 2, 3, 4, 5].map((n) => img("arcos", n, ["Lake pavilion, afternoon", "Pavilion facade", "Glazed corner", "Pavilion at golden hour", "Under the cantilever"][n - 1]));

const scene = (s: Partial<AIPlan["scene"]> & Pick<AIPlan["scene"], "modelId" | "placement">): AIPlan["scene"] => ({
  enabled: true,
  material: "auto",
  lighting: "studio",
  framing: "three-quarter",
  autoRotate: true,
  pointer: true,
  scrollCamera: false,
  exploded: false,
  quality: "medium",
  mobile: "simplified",
  ...s,
});

const motion = (m: Partial<AIPlan["motion"]>): AIPlan["motion"] => ({
  intensity: "balanced",
  smoothScroll: false,
  pinned: true,
  parallax: true,
  horizontal: false,
  textReveals: true,
  stagger: true,
  imageTransitions: false,
  particles: false,
  hover: true,
  cursor: false,
  transition: "slide-up",
  ...m,
});

const steps = (items: [string, string][]): Section["items"] => items.map(([title, body], i) => ({ title, body, meta: String(i + 1).padStart(2, "0") }));

const nocturneBrief = "Launch site for Nocturne, a fictional amber eau de parfum. Warm, nocturnal, quietly luxurious.";
const halcyonBrief = "Product page for Halcyon One, fictional over-ear headphones with a focus on materials and repairability.";
const lumenBrief = "Landing page for Lumen, a fictional analytics platform that explains your product data in plain language.";
const arcosBrief = "Portfolio for Studio Arcos, a fictional architecture practice working with light, timber and stone.";
const shardfallBrief = "Launch site for Shardfall, a fictional action-RPG set among living crystal.";
const nordBrief = "Lookbook site for Atelier Nord, a fictional slow-fashion label with heavy graphic identity.";

export const EXAMPLES: Example[] = [
  {
    slug: "nocturne",
    name: "Nocturne",
    brief: nocturneBrief,
    directionLabel: "Luxury · Perfume bottle",
    highlights: ["Scroll-controlled product showcase", "Golden-hour lighting", "Subtle motion"],
    spec: build(
      nocturneBrief,
      { output: { contactEmail: "hello@nocturne.example" } },
      plan({
        title: "Nocturne — Eau de Parfum",
        description: "Nocturne, an amber eau de parfum composed for the hours after dark.",
        brandName: "Nocturne",
        tagline: "Composed for the hours after dark.",
        ctaLabel: "Discover the scent",
        direction: "luxury",
        typeScale: "large",
        scene: scene({ modelId: "perfume-bottle", placement: "product-showcase", lighting: "golden-hour", framing: "hero-close", scrollCamera: true, mobile: "simplified" }),
        motion: motion({ intensity: "subtle", smoothScroll: true, transition: "fade", parallax: false, imageTransitions: true }),
        sections: [
          { type: "hero", eyebrow: "Eau de Parfum", heading: "Composed for the hours after dark.", body: "Amber, smoke and night-blooming jasmine, held in hand-finished glass." },
          { type: "scroll-film", filmId: "nocturne", eyebrow: "The flacon", heading: "Light, held in glass.", body: "Scroll to descend around the bottle.", items: steps([["Gold cap", "Weighted, and closes with a quiet click."], ["Amber heart", "Resin-dark liquid that glows by candlelight."], ["Hand-finished glass", "Every facet polished to hold the light."]]) },
          { type: "object-showcase", eyebrow: "Turn it", heading: "Every angle, live.", items: steps([["Weighted base", "A heavy glass foundation that catches candlelight."], ["Brushed collar", "Cool metal against warm amber."], ["Sculpted cap", "Closes with a quiet, magnetic click."]]) },
          { type: "gallery", eyebrow: "Gallery", heading: "After dark.", imageAssetIds: N, items: N.map((id, i) => ({ title: ["The cap", "In warm light", "Amber heart", "At rest"][i], meta: `0${i + 1}`, imageAssetId: id })) },
          { type: "pinned-story", eyebrow: "The composition", heading: "Three movements of a single night.", items: steps([["Top — Bergamot dusk", "Bright citrus fading into evening."], ["Heart — Night jasmine", "Floral, close to the skin."], ["Base — Amber & smoke", "Warm resin that lingers until morning."]]) },
          { type: "specs", eyebrow: "Details", heading: "The essentials.", items: [{ title: "Concentration", body: "Eau de parfum" }, { title: "Family", body: "Amber floral" }, { title: "Sizes", body: "50 ml · 100 ml" }] },
          { type: "cta", eyebrow: "Nocturne", heading: "Wear the night.", ctaLabel: "Discover the scent" },
        ],
      }),
      N,
    ),
  },
  {
    slug: "halcyon",
    name: "Halcyon One",
    brief: halcyonBrief,
    directionLabel: "Cinematic dark · Headphones",
    highlights: ["Exploded view on scroll", "Rim lighting", "Pinned storytelling"],
    spec: build(
      halcyonBrief,
      {},
      plan({
        title: "Halcyon One — Over-ear headphones",
        description: "Halcyon One: considered materials, replaceable parts and a sound you can live with.",
        brandName: "Halcyon",
        tagline: "Built to be heard. Built to last.",
        ctaLabel: "Pre-order",
        direction: "cinematic-dark",
        typeScale: "standard",
        scene: scene({ modelId: "headphones", placement: "hero", lighting: "moody-rim", material: "satin-plastic", exploded: true }),
        motion: motion({ intensity: "balanced", smoothScroll: true }),
        sections: [
          { type: "hero", eyebrow: "Halcyon One", heading: "Silence, then everything.", body: "Over-ear headphones designed around the materials you touch and the parts you can replace." },
          { type: "scroll-film", filmId: "halcyon", eyebrow: "Built to come apart", heading: "Every part has a reason.", items: steps([["Headband", "A steel core under a replaceable pad."], ["Cups", "Machined housings that click out by hand."], ["Cushions", "Swappable in seconds, no tools."]]) },
          { type: "kinetic-type", heading: "Hear every layer", items: [{ title: "Repair, don't replace" }] },
          { type: "exploded-view", eyebrow: "Anatomy", heading: "Every part, replaceable.", body: "Scroll to take Halcyon One apart.", items: [{ title: "Headband", body: "Steel core, replaceable pad." }, { title: "Ear cups", body: "Machined housings that click out." }, { title: "Cushions", body: "Protein leather, swappable in seconds." }] },
          { type: "features", eyebrow: "Why it matters", heading: "Designed for the long run.", items: [{ title: "Tool-free repairs", body: "Cushions, band and cable come apart by hand." }, { title: "Considered materials", body: "Metal where it matters, soft-touch where you touch." }, { title: "Quiet by design", body: "Closed-back cups for focus anywhere." }] },
          { type: "faq", eyebrow: "FAQ", heading: "Questions, answered.", items: [{ title: "When does it ship?", body: "[Shipping date]" }, { title: "Which parts can I replace?", body: "Cushions, headband pad and cable." }, { title: "Is there a warranty?", body: "[Warranty terms]" }] },
          { type: "gallery", eyebrow: "Details", heading: "Close up.", imageAssetIds: H, items: H.map((id, i) => ({ title: ["Halcyon One", "Cups and band", "Separated", "Reassembled"][i], meta: `0${i + 1}`, imageAssetId: id })) },
          { type: "cta", heading: "Reserve yours.", ctaLabel: "Pre-order" },
        ],
      }),
      H,
    ),
  },
  {
    slug: "lumen",
    name: "Lumen",
    brief: lumenBrief,
    directionLabel: "Clean technology · Liquid orb",
    highlights: ["Interactive abstract hero", "Readable feature grid", "Pricing and FAQ"],
    spec: build(
      lumenBrief,
      {},
      plan({
        title: "Lumen — Product analytics in plain language",
        description: "Lumen turns product data into clear answers your whole team can read.",
        brandName: "Lumen",
        tagline: "Your product data, explained.",
        ctaLabel: "Start free",
        direction: "clean-technology",
        typeScale: "standard",
        scene: scene({ modelId: "liquid-orb", placement: "hero", material: "iridescent", lighting: "studio" }),
        motion: motion({ intensity: "balanced" }),
        sections: [
          { type: "hero", eyebrow: "Product analytics", heading: "Your product data, explained.", body: "Ask a question in plain language. Lumen answers with the chart, the trend and the why." },
          { type: "features", eyebrow: "What you get", heading: "Answers, not dashboards.", items: [{ title: "Ask in plain language", body: "No query builder. Type the question you have." }, { title: "See the why", body: "Every answer shows the segments behind the change." }, { title: "Share the story", body: "Turn any answer into a one-page brief for your team." }, { title: "Private by default", body: "Your data stays in your warehouse." }] },
          { type: "pinned-story", eyebrow: "How it works", heading: "From question to decision.", items: steps([["Connect", "Point Lumen at your warehouse in minutes."], ["Ask", "Type the question you'd ask an analyst."], ["Decide", "Share a clear answer with the context attached."]]) },
          { type: "pricing", eyebrow: "Pricing", heading: "Start small. Grow with your team.", items: [{ title: "Team", meta: "[$ / month]", body: "Up to [N] seats\nPlain-language answers\nShared briefs" }, { title: "Business", meta: "[$ / month]", body: "Everything in Team\nSSO\nPriority support" }], ctaLabel: "Start free" },
          { type: "faq", eyebrow: "FAQ", heading: "Common questions.", items: [{ title: "Which warehouses are supported?", body: "[List supported warehouses]" }, { title: "Does Lumen store my data?", body: "Lumen queries your warehouse directly." }] },
          { type: "cta", heading: "See your data clearly.", ctaLabel: "Start free" },
        ],
      }),
    ),
  },
  {
    slug: "arcos",
    name: "Studio Arcos",
    brief: arcosBrief,
    directionLabel: "Minimal editorial · Pavilion",
    highlights: ["Spatial interactive section", "Horizontal case studies", "Restrained typography"],
    spec: build(
      arcosBrief,
      { output: { contactEmail: "studio@arcos.example" } },
      plan({
        title: "Studio Arcos — Architecture",
        description: "Studio Arcos designs calm buildings in timber, stone and light.",
        brandName: "Studio Arcos",
        tagline: "Buildings shaped by light.",
        ctaLabel: "Start a project",
        direction: "minimal-editorial",
        typeScale: "large",
        scene: scene({ modelId: "pavilion", placement: "dedicated-section", lighting: "daylight", material: "matte-clay", framing: "wide", scrollCamera: true, autoRotate: false }),
        motion: motion({ intensity: "subtle", horizontal: true, pinned: false, transition: "fade", parallax: false, imageTransitions: true }),
        sections: [
          { type: "hero", eyebrow: "Studio Arcos", heading: "Buildings shaped by light.", body: "An architecture practice working with timber, stone and daylight." },
          { type: "scroll-film", filmId: "arcos", eyebrow: "Lake pavilion", heading: "From afternoon to golden hour.", body: "Scroll to walk around the pavilion as the light changes.", items: steps([["Cantilever", "A single roof plane, floating over glass."], ["Glazing", "Full-height panes frame the lake."], ["Golden hour", "Light reaches deep under the roof at dusk."]]) },
          { type: "gallery", eyebrow: "Gallery", heading: "One building, five lights.", imageAssetIds: A, items: A.map((id, i) => ({ title: ["Afternoon", "Facade", "Glazed corner", "Golden hour", "Under the roof"][i], meta: `0${i + 1}`, imageAssetId: id })) },
          { type: "abstract-scene", eyebrow: "Approach", heading: "Fewer walls. More light.", body: "Drag to explore the pavilion study." },
          { type: "horizontal-cases", eyebrow: "Selected work", heading: "Projects.", items: [{ title: "Lake pavilion", body: "A timber shelter cantilevered over the shoreline.", meta: "Pavilion", imageAssetId: A[0] }, { title: "Courtyard house", body: "Rooms arranged around a single planted void.", meta: "Residential", imageAssetId: A[2] }, { title: "Stone library", body: "Thick walls, deep reveals, quiet reading rooms.", meta: "Civic", imageAssetId: A[4] }, { title: "Forest studio", body: "A workspace raised among the trees.", meta: "Workplace", imageAssetId: A[3] }] },
          { type: "features", eyebrow: "Practice", heading: "How we work.", items: [{ title: "Site first", body: "Every project starts with a season of observing light." }, { title: "Honest materials", body: "Timber, stone and lime, left to age." }, { title: "Small team", body: "The architects you meet are the architects who draw." }] },
          { type: "contact", eyebrow: "Contact", heading: "Tell us about your site.", body: "We take on a small number of projects each year." },
        ],
      }),
      A,
    ),
  },
  {
    slug: "shardfall",
    name: "Shardfall",
    brief: shardfallBrief,
    directionLabel: "Futuristic · Crystal cluster",
    highlights: ["Dramatic motion", "Particles and neon light", "Low-angle hero camera"],
    spec: build(
      shardfallBrief,
      {},
      plan({
        title: "Shardfall — Enter the living crystal",
        description: "Shardfall is an action-RPG set in a world of living crystal.",
        brandName: "Shardfall",
        tagline: "The crystal remembers.",
        ctaLabel: "Wishlist now",
        direction: "futuristic",
        typeScale: "large",
        scene: scene({ modelId: "crystal-cluster", placement: "hero", lighting: "neon-dual", material: "iridescent", framing: "low-angle", scrollCamera: true }),
        motion: motion({ intensity: "dramatic", particles: true, cursor: true, horizontal: true, transition: "clip-reveal", smoothScroll: true }),
        sections: [
          { type: "hero", eyebrow: "Action RPG", heading: "The crystal remembers.", body: "Shatter, absorb and reshape a world that grows back stronger." },
          { type: "scroll-film", filmId: "shardfall", eyebrow: "The Glass Steppe", heading: "Fly the living crystal.", items: steps([["The field", "Every shard hums with stored light."], ["The heart", "At the centre, the crystal that remembers."], ["The choice", "Break it — or let it grow."]]) },
          { type: "kinetic-type", heading: "Shatter · Absorb · Reshape", items: [{ title: "Coming [Release window]" }] },
          { type: "pinned-story", eyebrow: "The world", heading: "A land that fights back.", items: steps([["Living crystal", "Every shard you break regrows somewhere new."], ["Absorb its power", "Weapons evolve from the crystal you collect."], ["Reshape the map", "Your choices change the world for good."]]) },
          { type: "horizontal-cases", eyebrow: "Regions", heading: "Five shattered realms.", items: [{ title: "The Glass Steppe", body: "Wind-cut plains of singing crystal.", meta: "Region I", imageAssetId: S[0] }, { title: "Hollow Spire", body: "A tower grown from a single shard.", meta: "Region II", imageAssetId: S[2] }, { title: "Mirror Fen", body: "Reflections that move on their own.", meta: "Region III", imageAssetId: S[1] }, { title: "Neon Reach", body: "Where the crystal meets the sky.", meta: "Region IV", imageAssetId: S[3] }] },
          { type: "faq", eyebrow: "FAQ", heading: "Before you enter.", items: [{ title: "Which platforms?", body: "[Platforms]" }, { title: "When does it launch?", body: "[Release window]" }] },
          { type: "cta", heading: "Enter the crystal.", ctaLabel: "Wishlist now" },
        ],
      }),
      S,
    ),
  },
  {
    slug: "atelier-nord",
    name: "Atelier Nord",
    brief: nordBrief,
    directionLabel: "Brutalist · Monolith stack",
    highlights: ["Fixed 3D background", "Kinetic typography", "Graphic layout"],
    spec: build(
      nordBrief,
      { output: { contactEmail: "studio@nord.example" } },
      plan({
        title: "Atelier Nord — Collection 04",
        description: "Atelier Nord makes few garments, slowly, in heavy natural cloth.",
        brandName: "Atelier Nord",
        tagline: "Fewer garments. Made slower.",
        ctaLabel: "View the collection",
        direction: "brutalist",
        typeScale: "large",
        scene: scene({ modelId: "monolith-stack", placement: "background", lighting: "daylight", material: "matte-clay", framing: "wide", pointer: true }),
        motion: motion({ intensity: "balanced", pinned: false, horizontal: true }),
        sections: [
          { type: "hero", eyebrow: "Collection 04", heading: "Fewer garments. Made slower.", body: "Heavy wool, raw linen and undyed cotton, cut in small runs." },
          { type: "kinetic-type", heading: "Atelier Nord", items: [{ title: "Collection 04" }] },
          { type: "horizontal-cases", eyebrow: "Lookbook", heading: "The pieces.", items: [{ title: "Field coat", body: "Boiled wool, horn buttons.", meta: "01" }, { title: "Work shirt", body: "Raw linen, double-stitched seams.", meta: "02" }, { title: "Wide trouser", body: "Undyed cotton twill.", meta: "03" }, { title: "Knit", body: "Undyed wool, hand-finished.", meta: "04" }] },
          { type: "specs", eyebrow: "Materials", heading: "What it's made of.", items: [{ title: "Wool", body: "Boiled, undyed" }, { title: "Linen", body: "Raw, washed once" }, { title: "Cotton", body: "Organic twill" }] },
          { type: "contact", eyebrow: "Studio", heading: "Visit by appointment.", body: "Write to book a fitting." },
        ],
      }),
    ),
  },
];

export function getExample(slug: string): Example | undefined {
  return EXAMPLES.find((e) => e.slug === slug);
}
