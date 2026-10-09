/**
 * Curated 3D subjects. Every entry is an original procedural asset authored in
 * `src/runtime/models.js` for this project (no third-party downloads), released
 * under CC0-1.0 so generated websites can redistribute them freely.
 * Provenance is also recorded in `ASSETS.md`.
 */

export type ModelCategory = "product" | "abstract" | "architecture" | "gaming" | "lifestyle";

export interface CatalogModel {
  id: string;
  name: string;
  category: ModelCategory;
  kind: "model" | "procedural";
  description: string;
  /** Named parts; exploded view is offered only when there are 2+ separable parts. */
  parts: string[];
  separable: boolean;
  defaultMaterial: string;
  /** Approximate triangle count at "high" quality. */
  triangles: number;
  tags: string[];
  license: "CC0-1.0";
  provenance: string;
}

const PROVENANCE = "Original procedural geometry authored for Centixio (src/runtime/models.js).";

export const MODELS: CatalogModel[] = [
  {
    id: "perfume-bottle",
    name: "Perfume bottle",
    category: "product",
    kind: "model",
    description: "Faceted glass flacon with liquid, collar and weighted cap.",
    parts: ["glass", "liquid", "collar", "cap"],
    separable: true,
    defaultMaterial: "glass",
    triangles: 9000,
    tags: ["fragrance", "perfume", "beauty", "cosmetic", "luxury", "skincare", "bottle"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "headphones",
    name: "Over-ear headphones",
    category: "product",
    kind: "model",
    description: "Headband, yokes and cushioned ear cups.",
    parts: ["band", "left-cup", "right-cup", "cushions"],
    separable: true,
    defaultMaterial: "satin-plastic",
    triangles: 14000,
    tags: ["audio", "music", "headphones", "sound", "electronics", "podcast"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "smartwatch",
    name: "Watch",
    category: "product",
    kind: "model",
    description: "Rounded case, glass face, crown and strap.",
    parts: ["case", "face", "crown", "strap"],
    separable: true,
    defaultMaterial: "brushed-metal",
    triangles: 10000,
    tags: ["watch", "wearable", "fitness", "timepiece", "jewelry", "health"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "smartphone",
    name: "Smartphone",
    category: "product",
    kind: "model",
    description: "Slim device body with display, camera island and buttons.",
    parts: ["body", "screen", "camera", "buttons"],
    separable: true,
    defaultMaterial: "brushed-metal",
    triangles: 6000,
    tags: ["app", "mobile", "phone", "device", "saas", "fintech", "startup"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "speaker",
    name: "Smart speaker",
    category: "product",
    kind: "model",
    description: "Cylindrical body with fabric grille, top ring and driver.",
    parts: ["body", "grille", "top-ring", "driver"],
    separable: true,
    defaultMaterial: "matte-clay",
    triangles: 12000,
    tags: ["speaker", "audio", "home", "smart home", "music"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "ring",
    name: "Gem ring",
    category: "lifestyle",
    kind: "model",
    description: "Polished band with a faceted stone.",
    parts: ["band", "gem"],
    separable: true,
    defaultMaterial: "gold",
    triangles: 5000,
    tags: ["jewelry", "ring", "wedding", "diamond", "luxury", "fashion"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "pavilion",
    name: "Pavilion",
    category: "architecture",
    kind: "model",
    description: "Cantilevered roof, slender columns and a stone plinth.",
    parts: ["plinth", "columns", "roof", "glazing"],
    separable: true,
    defaultMaterial: "matte-clay",
    triangles: 4000,
    tags: ["architecture", "interior", "real estate", "studio", "building", "design"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "crystal-cluster",
    name: "Crystal cluster",
    category: "gaming",
    kind: "model",
    description: "Glowing shards rising from a rock base.",
    parts: ["base", "shards"],
    separable: true,
    defaultMaterial: "iridescent",
    triangles: 3000,
    tags: ["gaming", "fantasy", "game", "crypto", "web3", "magic", "esports"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "torus-knot",
    name: "Sculpted knot",
    category: "abstract",
    kind: "procedural",
    description: "A continuous knot. A single surface, so exploded view is unavailable.",
    parts: ["knot"],
    separable: false,
    defaultMaterial: "chrome",
    triangles: 16000,
    tags: ["abstract", "agency", "art", "brand", "creative"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "liquid-orb",
    name: "Liquid orb",
    category: "abstract",
    kind: "procedural",
    description: "A noise-displaced sphere that breathes and reacts to the pointer.",
    parts: ["orb"],
    separable: false,
    defaultMaterial: "iridescent",
    triangles: 20000,
    tags: ["ai", "saas", "tech", "abstract", "startup", "data", "wellness"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "wave-field",
    name: "Wave field",
    category: "abstract",
    kind: "procedural",
    description: "An animated point-grid landscape suited to backgrounds.",
    parts: ["field"],
    separable: false,
    defaultMaterial: "auto",
    triangles: 0,
    tags: ["data", "event", "music", "conference", "festival", "background"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
  {
    id: "monolith-stack",
    name: "Monolith stack",
    category: "abstract",
    kind: "procedural",
    description: "Stacked slabs that fan apart. Good for layered storytelling.",
    parts: ["slab-1", "slab-2", "slab-3", "slab-4", "slab-5"],
    separable: true,
    defaultMaterial: "brushed-metal",
    triangles: 600,
    tags: ["saas", "platform", "infrastructure", "fintech", "agency", "layers"],
    license: "CC0-1.0",
    provenance: PROVENANCE,
  },
];

export function getModel(id: string | null | undefined): CatalogModel | undefined {
  return MODELS.find((m) => m.id === id);
}

export const MATERIAL_PRESETS = [
  { id: "auto", name: "Auto (model default)" },
  { id: "glass", name: "Glass" },
  { id: "chrome", name: "Chrome" },
  { id: "brushed-metal", name: "Brushed metal" },
  { id: "gold", name: "Gold" },
  { id: "satin-plastic", name: "Satin plastic" },
  { id: "ceramic", name: "Ceramic" },
  { id: "matte-clay", name: "Matte clay" },
  { id: "iridescent", name: "Iridescent" },
] as const;

export const LIGHTING_PRESETS = [
  { id: "auto", name: "Auto (from direction)" },
  { id: "studio", name: "Studio softbox" },
  { id: "golden-hour", name: "Golden hour" },
  { id: "moody-rim", name: "Moody rim light" },
  { id: "neon-dual", name: "Neon dual-tone" },
  { id: "daylight", name: "Daylight" },
  { id: "gallery", name: "Gallery spots" },
] as const;

export const CAMERA_FRAMINGS = [
  { id: "auto", name: "Auto" },
  { id: "hero-close", name: "Close-up" },
  { id: "three-quarter", name: "Three-quarter" },
  { id: "wide", name: "Wide" },
  { id: "low-angle", name: "Low angle" },
] as const;

export type MaterialPresetId = (typeof MATERIAL_PRESETS)[number]["id"];
export type LightingPresetId = (typeof LIGHTING_PRESETS)[number]["id"];
export type CameraFramingId = (typeof CAMERA_FRAMINGS)[number]["id"];
