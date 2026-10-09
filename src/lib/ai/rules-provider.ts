import type { AIPlan } from "@/lib/spec/schema";
import type { SectionType } from "@/lib/config-schema";
import { MODELS, getModel } from "@/lib/catalog/models";
import { getDirection, VISUAL_DIRECTIONS } from "@/lib/catalog/directions";
import { createRulesPlan, sectionContent } from "./rules-planner";
import { ProviderError, type AIProvider, type EditRequest, type PlanRequest, type RepairRequest } from "./provider";
import { detectIndustry } from "@/lib/recommend/engine";

/**
 * Deterministic provider for demo mode and tests. It understands a fixed set
 * of edit requests and says so when it cannot interpret one (the job then
 * fails and its credits are released).
 */

const COLORS: Record<string, string> = {
  black: "#08080A",
  white: "#F7F5F0",
  gold: "#D4AF37",
  golden: "#D4AF37",
  silver: "#C0C4CC",
  red: "#E5383B",
  crimson: "#C1121F",
  orange: "#FF7A1A",
  amber: "#F2A541",
  yellow: "#F7D046",
  green: "#2BB673",
  emerald: "#10B981",
  teal: "#14B8A6",
  cyan: "#22D3EE",
  blue: "#3B82F6",
  navy: "#0B1F3A",
  indigo: "#6366F1",
  purple: "#8B5CF6",
  violet: "#8B5CF6",
  pink: "#EC4899",
  magenta: "#D946EF",
  cream: "#F3EBDD",
  beige: "#E8DCC6",
  brown: "#7A4E2D",
  copper: "#B87333",
  bronze: "#A97142",
  grey: "#8A8F98",
  gray: "#8A8F98",
  charcoal: "#1C1C1F",
};

const DARK = new Set(["black", "navy", "charcoal", "brown"]);

const SECTION_WORDS: [RegExp, SectionType][] = [
  [/pricing|prices|plans/, "pricing"],
  [/faq|questions/, "faq"],
  [/gallery|images|photos/, "gallery"],
  [/feature/, "features"],
  [/contact/, "contact"],
  [/spec|details/, "specs"],
  [/story|storytelling/, "pinned-story"],
  [/case stud|projects|portfolio/, "horizontal-cases"],
  [/exploded/, "exploded-view"],
  [/marquee|kinetic|animated type|typography/, "kinetic-type"],
  [/interactive scene|abstract scene/, "abstract-scene"],
  [/showcase/, "object-showcase"],
  [/call to action|cta/, "cta"],
];

export function applyRuleEdit(plan: AIPlan, instruction: string, prompt: string): { plan: AIPlan; changes: string[] } {
  const p: AIPlan = structuredClone(plan);
  const t = instruction.toLowerCase();
  const changes: string[] = [];
  const ctx = { brand: p.brandName, noun: "product", industry: detectIndustry({ prompt, config: { purpose: "auto", brand: { description: "", audience: "" } } as never, assets: [] }), audience: "", description: prompt, cta: p.ctaLabel, images: [] as string[] };

  const mobile = /\b(mobile|phone|phones|small screens?)\b/.test(t);
  if (mobile && /\b(reduce|less|lighter|simplif|calmer|turn down|disable|static|no)\b/.test(t)) {
    p.scene.mobile = /\b(disable|no 3d|remove)\b/.test(t) ? "disabled" : /\bstatic\b/.test(t) ? "static-fallback" : "simplified";
    p.motion.particles = false;
    p.motion.cursor = false;
    changes.push(`On phones, 3D is now ${p.scene.mobile === "simplified" ? "simplified (lower resolution, fewer effects)" : p.scene.mobile === "disabled" ? "turned off" : "replaced with a static fallback"} and motion is reduced.`);
  } else if (/\b(more|very|super|extra) (dramatic|intense|dynamic|energetic|cinematic)|\bdramatic\b|\bbolder motion\b/.test(t)) {
    p.motion.intensity = "dramatic";
    p.motion.transition = "clip-reveal";
    p.motion.parallax = true;
    if (p.scene.enabled) p.scene.scrollCamera = true;
    changes.push("Motion is now dramatic: bigger reveals, clip transitions and a scroll-driven camera.");
  } else if (/\b(subtle|calmer|less animation|fewer animations|tone down|quieter|slower)\b/.test(t)) {
    p.motion.intensity = "subtle";
    p.motion.transition = "fade";
    p.motion.particles = false;
    p.motion.cursor = false;
    changes.push("Motion is now subtle with soft fades.");
  }

  if (/\b(different|another|other|new|change the|swap the) (3d )?(model|object|subject)\b/.test(t) || /\buse (a |an |the )?([a-z -]+?) (model|object)\b/.test(t)) {
    const named = MODELS.find((m) => t.includes(m.name.toLowerCase()) || t.includes(m.id.replace(/-/g, " ")));
    const current = getModel(p.scene.modelId);
    const pool = MODELS.filter((m) => m.id !== p.scene.modelId && (!current || m.category === current.category));
    const next = named ?? pool[0] ?? MODELS.find((m) => m.id !== p.scene.modelId)!;
    p.scene.modelId = next.id;
    p.scene.material = "auto";
    if (!next.separable) p.scene.exploded = false;
    changes.push(`Switched the 3D subject to the ${next.name.toLowerCase()}.`);
  }

  const colorWords = Object.keys(COLORS).filter((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (colorWords.length && /\b(color|colour|palette|scheme|make it|change|use|switch)\b/.test(t)) {
    const dark = colorWords.find((c) => DARK.has(c));
    const accents = colorWords.filter((c) => c !== dark && c !== "white" && c !== "cream");
    const light = colorWords.find((c) => c === "white" || c === "cream");
    if (dark) {
      p.palette.background = COLORS[dark];
      p.palette.surface = dark === "black" ? "#141416" : "#16202E";
      p.palette.text = "#F5F1E8";
      p.palette.muted = "#A7A29A";
    } else if (light) {
      p.palette.background = COLORS[light];
      p.palette.surface = "#FFFFFF";
      p.palette.text = "#141414";
      p.palette.muted = "#5F5C57";
    }
    if (accents[0]) p.palette.accent = COLORS[accents[0]];
    if (accents[1]) p.palette.accent2 = COLORS[accents[1]];
    changes.push(`Recolored the palette to ${colorWords.join(" and ")}.`);
  }

  if (/\b(luxur|premium|elegant|high-end|upscale|refined)/.test(t)) {
    const lux = getDirection("luxury");
    p.direction = "luxury";
    p.displayFont = lux.fonts.display;
    p.bodyFont = lux.fonts.body;
    p.scene.lighting = "golden-hour";
    if (p.motion.intensity === "dramatic") p.motion.intensity = "balanced";
    if (!colorWords.length) p.palette = lux.palette;
    p.typeScale = "large";
    const hero = p.sections.find((s) => s.type === "hero");
    if (hero && /\bhero\b/.test(t)) hero.eyebrow = hero.eyebrow ?? p.brandName;
    changes.push("Made the design more luxurious: serif display type, warm golden lighting and restrained motion.");
  }

  for (const d of VISUAL_DIRECTIONS) {
    if (d.id !== "custom" && d.id !== "luxury" && t.includes(d.name.toLowerCase())) {
      p.direction = d.id as AIPlan["direction"];
      p.palette = d.palette;
      p.displayFont = d.fonts.display;
      p.bodyFont = d.fonts.body;
      changes.push(`Switched to the ${d.name} direction.`);
    }
  }

  const add = t.match(/\badd (a |an |some )?(.+?)( section| block| part|$)/);
  if (add) {
    const type = SECTION_WORDS.find(([re]) => re.test(add[2]))?.[1];
    if (type && !p.sections.some((s) => s.type === type)) {
      const before = Math.max(1, p.sections.length - 1);
      p.sections.splice(before, 0, sectionContent(type, ctx));
      if (type === "exploded-view") p.scene.exploded = true;
      changes.push(`Added a ${type.replace(/-/g, " ")} section.`);
    }
  }
  const remove = t.match(/\b(remove|delete|drop) (the )?(.+?)( section|$)/);
  if (remove) {
    const type = SECTION_WORDS.find(([re]) => re.test(remove[3]))?.[1];
    if (type && type !== "hero" && p.sections.some((s) => s.type === type)) {
      p.sections = p.sections.filter((s) => s.type !== type);
      changes.push(`Removed the ${type.replace(/-/g, " ")} section.`);
    }
  }

  const headline = instruction.match(/(?:headline|heading|title)\s+(?:to|say|says|reads?)\s*[:"“']+([^"”']{2,120})["”']?/i);
  if (headline) {
    const hero = p.sections.find((s) => s.type === "hero");
    if (hero) {
      hero.heading = headline[1].trim();
      changes.push(`Changed the headline to “${hero.heading}”.`);
    }
  }

  if (/\b(disable|remove|turn off|no) 3d\b/.test(t) && !mobile) {
    p.scene.enabled = false;
    changes.push("Turned 3D off.");
  } else if (/\b(enable|add|turn on) 3d\b/.test(t)) {
    p.scene.enabled = true;
    changes.push("Turned 3D on.");
  }
  if (/\bparticles?\b/.test(t)) {
    p.motion.particles = !/\b(no|remove|without|disable|turn off)\b/.test(t);
    changes.push(p.motion.particles ? "Added particles." : "Removed particles.");
  }
  if (/\bsmooth scroll/.test(t)) {
    p.motion.smoothScroll = !/\b(no|remove|without|disable|turn off)\b/.test(t);
    changes.push(p.motion.smoothScroll ? "Enabled smooth scrolling." : "Disabled smooth scrolling.");
  }

  p.notes = changes.length ? changes : p.notes;
  return { plan: p, changes };
}

export class RulesProvider implements AIProvider {
  readonly id = "rules";
  readonly label = "Rule-based composer (no AI)";
  readonly isAI = false;

  async plan(req: PlanRequest): Promise<AIPlan> {
    return createRulesPlan(req.prompt, req.config, req.assets);
  }

  async edit(req: EditRequest): Promise<AIPlan> {
    if (req.scope === "major" && /\b(redesign|start over|from scratch|new direction|new concept)\b/i.test(req.instruction)) {
      const fresh = createRulesPlan(`${req.prompt}\n${req.instruction}`, { ...req.config, direction: "auto" }, req.assets);
      return { ...fresh, brandName: req.current.brandName, notes: ["Re-planned the site with the rule-based composer."] };
    }
    const { plan, changes } = applyRuleEdit(req.current, req.instruction, req.prompt);
    if (!changes.length) {
      throw new ProviderError(
        "The rule-based editor (used because no AI provider is configured) could not interpret this request. Try phrasing like “make the scroll more dramatic”, “use a different 3D model”, “change the colors to black and gold”, “reduce animation on mobile” or “add a pricing section”.",
        false,
        "not_understood",
      );
    }
    return plan;
  }

  async repair(req: RepairRequest): Promise<AIPlan> {
    return req.plan;
  }
}
