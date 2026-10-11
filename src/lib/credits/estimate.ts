import { CREDIT_COSTS, IMAGE_BUDGET } from "@/config/pricing";
import type { WebsiteConfig } from "@/lib/config-schema";

export interface CostLine {
  label: string;
  credits: number;
}

export interface CostEstimate {
  action: "generate" | "ask" | "edit-small" | "edit-major" | "reassemble" | "restore" | "repair";
  total: number;
  lines: CostLine[];
  explanation: string;
}

/** Complex 3D = work that needs custom model handling or scroll-synchronized scenes. */
export function isComplex3d(config: WebsiteConfig): { complex: boolean; reasons: string[] } {
  const s = config.scene;
  if (!s.enabled) return { complex: false, reasons: [] };
  const reasons: string[] = [];
  if (s.subject === "uploaded" && s.uploadedModelAssetId) reasons.push("uploaded model");
  if (s.explodedView) reasons.push("exploded view");
  if ((s.scrollCamera || config.motion.scrollCamera) && config.motion.pinnedSections) reasons.push("scroll-driven camera with pinned sections");
  if (s.quality === "high") reasons.push("high-quality rendering");
  return { complex: reasons.length > 0, reasons };
}

/** Whether the server can generate images (passed to the client so its estimate matches the charge). */
export interface EstimateOptions {
  aiImages: boolean;
}

/** Number of images a generation will create: none when imagery is off or no provider is configured. */
export function generationImageBudget(config: WebsiteConfig, opts: EstimateOptions): number {
  return opts.aiImages && config.brand.imagery !== "off" ? IMAGE_BUDGET.generation : 0;
}

export function estimateGeneration(config: WebsiteConfig, opts: EstimateOptions): CostEstimate {
  const lines: CostLine[] = [{ label: "Landing page generation", credits: CREDIT_COSTS.initialGeneration }];
  const c3d = isComplex3d(config);
  if (c3d.complex) lines.push({ label: `Complex 3D (${c3d.reasons.join(", ")})`, credits: CREDIT_COSTS.complex3dSurcharge });
  const images = generationImageBudget(config, opts);
  if (images) lines.push({ label: `Up to ${images} AI images (unused ones refunded)`, credits: images * CREDIT_COSTS.generatedImage });
  const total = lines.reduce((n, l) => n + l.credits, 0);
  return { action: "generate", total, lines, explanation: "Plans the design, creates imagery, assembles the page, validates it and saves a new version." };
}

const MAJOR_PATTERNS = [
  /\b(redesign|re-design|start over|from scratch|completely|entirely|whole (site|website|page)|rebuild|overhaul)\b/i,
  /\b(new|different) (style|direction|look|concept|layout|structure)\b/i,
  /\b(change|switch) (the )?(entire|whole|overall)\b/i,
  /\b(translate|in (spanish|french|german|italian|portuguese|japanese|chinese|korean|dutch))\b/i,
  /\b(rewrite|re-write) (all|every|the whole|everything)\b/i,
  /\b(too (simple|plain|basic|boring|bland|generic)|looks? (cheap|bad|boring|generic|basic)|not (good|great|nice|premium) enough|i (don'?t|do not) like (it|this))\b/i,
  // Asking for imagery of the subject means new visuals.
  /\b(images?|photos?|pictures?|imagery|visuals?|photography)\b/i,
];

/** Open-ended quality requests ("improve it 10x") need a real re-plan, not a copy tweak… */
const QUALITY = /\b(improve|upgrade|elevate|level up|enhance|polish|better|premium|top[- ]tier|world[- ]class|award|stunning|amazing|wow|impressive|\d+x)\b/i;
/** …unless they name a specific element ("improve the headline"). */
const TARGETED = /\b(heading|headline|title|button|text|copy|wording|font|colou?rs?|faq|price|pricing|email|link|cta|logo|footer|nav)\b/i;

/** Words that make a message a change request even when phrased as a question ("can you make it blue?"). */
const CHANGE_VERBS = /\b(make|change|add|remove|delete|replace|use|switch|swap|turn|move|put|set|increase|decrease|reduce|enlarge|shrink|rewrite|redo|redesign|fix|update|include|drop|try|translate|generate|create|improve|show)\b/i;
/** Asking about what exists or for advice ("why did you use…", "should it be serif?"). */
const INQUIRY_START = /^(why|what(?! if\b| about\b)|which|who|where|when|is|are|does|did|was|were|should|explain|tell me|help me understand|how (do|does|did|can|could|would|is|are|much|many))\b/i;
/** Polite requests ("can you make it blue?") are changes when they contain an action. */
const REQUEST_START = /^(can|could|would|will|please)\b/i;

/**
 * Questions about the page are answered in chat for free and change nothing.
 * Deterministic so the "Free" label shown before sending is what happens.
 */
export function isQuestion(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (INQUIRY_START.test(m)) return true;
  if (REQUEST_START.test(m)) return !CHANGE_VERBS.test(m);
  return m.endsWith("?") && !CHANGE_VERBS.test(m);
}

/** Deterministic classification so the cost shown before sending is the cost charged. */
export function classifyEdit(message: string): "small" | "major" {
  if (MAJOR_PATTERNS.some((re) => re.test(message))) return "major";
  return QUALITY.test(message) && !TARGETED.test(message) ? "major" : "small";
}

export function editImageBudget(message: string, opts: EstimateOptions): number {
  if (!opts.aiImages || isQuestion(message)) return 0;
  return classifyEdit(message) === "major" ? IMAGE_BUDGET.majorEdit : IMAGE_BUDGET.smallEdit;
}

export function estimateEdit(message: string, opts: EstimateOptions): CostEstimate {
  if (isQuestion(message)) {
    return { action: "ask", total: 0, lines: [], explanation: "Questions are answered in chat and don't change the page." };
  }
  const scope = classifyEdit(message);
  if (scope === "major") {
    const images = editImageBudget(message, opts);
    const lines: CostLine[] = [{ label: "Major redesign", credits: CREDIT_COSTS.majorRedesign }];
    if (images) lines.push({ label: `Up to ${images} new AI images (unused ones refunded)`, credits: images * CREDIT_COSTS.generatedImage });
    return {
      action: "edit-major",
      total: lines.reduce((n, l) => n + l.credits, 0),
      lines,
      explanation: "This request re-plans the page: direction, structure, copy and imagery.",
    };
  }
  const images = editImageBudget(message, opts);
  const lines: CostLine[] = [{ label: "Targeted edit", credits: CREDIT_COSTS.smallEdit }];
  if (images) lines.push({ label: `Up to ${images} AI image if needed (refunded if not used)`, credits: images * CREDIT_COSTS.generatedImage });
  return {
    action: "edit-small",
    total: lines.reduce((n, l) => n + l.credits, 0),
    lines,
    explanation: "Changes only what you asked for and keeps the rest of the design. If nothing needs changing, nothing is charged.",
  };
}

export const FREE_ACTIONS = {
  reassemble: { action: "reassemble", total: CREDIT_COSTS.reassemble, lines: [], explanation: "These settings re-assemble the current design without an AI call." } satisfies CostEstimate,
  restore: { action: "restore", total: CREDIT_COSTS.restore, lines: [], explanation: "Restoring creates a new version from an earlier one." } satisfies CostEstimate,
  repair: { action: "repair", total: CREDIT_COSTS.repair, lines: [], explanation: "Repairs after preview errors are free." } satisfies CostEstimate,
};

// ---------------------------------------------------------------- config diff

/** Paths whose change only needs re-assembly of the existing design (free). */
const FREE_PATHS = ["direction", "scene", "motion", "output", "brand.colors", "brand.fontPairing", "brand.logoAssetId", "brand.imageAssetIds", "brand.primaryCta", "brand.primaryCtaUrl"];
/** Paths that change content and need the AI (charged as a targeted edit). */
const SMALL_PATHS = ["brand.brandName", "brand.sections", "brand.sectionsMode"];
/** Paths that change the brief itself (charged as a major redesign). */
const MAJOR_PATHS = ["purpose", "brand.description", "brand.audience", "brand.language", "brand.referenceAssetId"];

function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
  } else {
    out[prefix] = JSON.stringify(obj);
  }
  return out;
}

export interface ConfigDiff {
  changed: string[];
  tier: "none" | "free" | "small" | "major";
  estimate: CostEstimate | null;
  explanation: string;
}

export function diffConfig(applied: WebsiteConfig | null, current: WebsiteConfig): ConfigDiff {
  if (!applied) return { changed: [], tier: "none", estimate: null, explanation: "" };
  const a = flatten(applied);
  const b = flatten(current);
  const changed = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter((k) => a[k] !== b[k]);
  if (!changed.length) return { changed, tier: "none", estimate: null, explanation: "" };
  const under = (paths: string[]) => changed.some((c) => paths.some((p) => c === p || c.startsWith(`${p}.`)));
  if (under(MAJOR_PATHS)) {
    return { changed, tier: "major", estimate: { action: "edit-major", total: CREDIT_COSTS.majorRedesign, lines: [{ label: "Re-plan with your new brief", credits: CREDIT_COSTS.majorRedesign }], explanation: "" }, explanation: "You changed the brief (purpose, description, audience, language or reference). Applying re-plans the content with AI." };
  }
  if (under(SMALL_PATHS)) {
    return { changed, tier: "small", estimate: { action: "edit-small", total: CREDIT_COSTS.smallEdit, lines: [{ label: "Write content for the changes", credits: CREDIT_COSTS.smallEdit }], explanation: "" }, explanation: "New sections or a new brand name need new copy, which requires a targeted AI edit." };
  }
  if (under(FREE_PATHS)) {
    return { changed, tier: "free", estimate: FREE_ACTIONS.reassemble, explanation: "Visual, 3D, motion and output settings are applied by re-assembling the current design. No AI call and no credits." };
  }
  return { changed, tier: "free", estimate: FREE_ACTIONS.reassemble, explanation: "These changes are applied without an AI call." };
}
