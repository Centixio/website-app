import { CREDIT_COSTS } from "@/config/pricing";
import type { WebsiteConfig } from "@/lib/config-schema";

export interface CostLine {
  label: string;
  credits: number;
}

export interface CostEstimate {
  action: "generate" | "edit-small" | "edit-major" | "reassemble" | "restore" | "repair";
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

export function estimateGeneration(config: WebsiteConfig): CostEstimate {
  const lines: CostLine[] = [{ label: "Website generation", credits: CREDIT_COSTS.initialGeneration }];
  const c3d = isComplex3d(config);
  if (c3d.complex) lines.push({ label: `Complex 3D (${c3d.reasons.join(", ")})`, credits: CREDIT_COSTS.complex3dSurcharge });
  const total = lines.reduce((n, l) => n + l.credits, 0);
  return { action: "generate", total, lines, explanation: "Plans the design, assembles the site, validates it and saves a new version." };
}

const MAJOR_PATTERNS = [
  /\b(redesign|re-design|start over|from scratch|completely|entirely|whole (site|website|page)|rebuild|overhaul)\b/i,
  /\b(new|different) (style|direction|look|concept|layout|structure)\b/i,
  /\b(change|switch) (the )?(entire|whole|overall)\b/i,
  /\b(translate|in (spanish|french|german|italian|portuguese|japanese|chinese|korean|dutch))\b/i,
  /\b(rewrite|re-write) (all|every|the whole|everything)\b/i,
];

/** Deterministic classification so the cost shown before sending is the cost charged. */
export function classifyEdit(message: string): "small" | "major" {
  return MAJOR_PATTERNS.some((re) => re.test(message)) ? "major" : "small";
}

export function estimateEdit(message: string): CostEstimate {
  const scope = classifyEdit(message);
  if (scope === "major") {
    return {
      action: "edit-major",
      total: CREDIT_COSTS.majorRedesign,
      lines: [{ label: "Major redesign", credits: CREDIT_COSTS.majorRedesign }],
      explanation: "This request changes most of the site, so the design is re-planned.",
    };
  }
  return {
    action: "edit-small",
    total: CREDIT_COSTS.smallEdit,
    lines: [{ label: "Targeted edit", credits: CREDIT_COSTS.smallEdit }],
    explanation: "Changes only what you asked for and keeps the rest of the design.",
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
