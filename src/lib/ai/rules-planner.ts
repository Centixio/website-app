import type { SectionType, WebsiteConfig } from "@/lib/config-schema";
import type { AIPlan } from "@/lib/spec/schema";
import { getDirection } from "@/lib/catalog/directions";
import { detectIndustry, resolveAutoConfig, type AssetSummary, type Industry } from "@/lib/recommend/engine";

/**
 * Deterministic planner used when no AI provider is configured (demo mode,
 * tests). Copy is templated from the brief; it never invents statistics,
 * customers or testimonials, and uses bracketed placeholders for facts it
 * cannot know.
 */

const NOUN: Record<Industry, string> = {
  fragrance: "fragrance",
  jewelry: "piece",
  watch: "watch",
  audio: "sound",
  architecture: "spaces",
  saas: "platform",
  app: "app",
  gaming: "game",
  fashion: "collection",
  agency: "studio",
  portfolio: "work",
  event: "event",
  fintech: "platform",
  generic: "product",
};

export function extractBrandName(prompt: string): string | null {
  const quoted = prompt.match(/["“']([^"”']{2,40})["”']/);
  if (quoted) return quoted[1].trim();
  const called = prompt.match(/\b(?:called|named|brand(?:ed)?|for)\s+([A-Z][\w&.\-]*(?:\s+[A-Z][\w&.\-]*){0,2})/);
  if (called) return called[1].trim();
  return null;
}

function firstSentence(text: string, max = 150): string {
  const s = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
}

interface CopyCtx {
  brand: string;
  noun: string;
  industry: Industry;
  audience: string;
  description: string;
  /** Description the user wrote in settings (never the raw brief, which reads like instructions). */
  brandDescription?: string;
  cta: string;
  images: string[];
}

const HERO_LINES: Partial<Record<Industry, string>> = {
  fragrance: "A scent composed in light.",
  jewelry: "Made to be kept.",
  watch: "Time, precisely considered.",
  audio: "Hear every layer.",
  architecture: "Spaces shaped by light.",
  saas: "Work that flows.",
  app: "Everything, one tap away.",
  gaming: "Enter the next world.",
  fashion: "Wear the moment.",
  agency: "Ideas, built to move.",
  portfolio: "Selected work.",
  event: "Be in the room.",
  fintech: "Money, made clear.",
};

export function sectionContent(type: SectionType, c: CopyCtx): AIPlan["sections"][number] {
  const B = c.brand;
  switch (type) {
    case "hero":
      return { type, eyebrow: B, heading: HERO_LINES[c.industry] ?? `Meet ${B}.`, body: c.brandDescription ? firstSentence(c.brandDescription) : `The new ${c.noun} from ${B}${c.audience ? `, made for ${c.audience}` : ""}.`, variant: "default" };
    case "object-showcase":
      return {
        type,
        eyebrow: "In detail",
        heading: `Every angle of the ${c.noun}.`,
        items: [
          { title: "Form", body: `Turn the ${c.noun} as you scroll and see how it is shaped.`, meta: "01" },
          { title: "Material", body: "Surfaces chosen to catch light and feel considered in the hand.", meta: "02" },
          { title: "Finish", body: "[Describe the finishing detail that makes it yours.]", meta: "03" },
        ],
      };
    case "exploded-view":
      return { type, eyebrow: "Anatomy", heading: "Built from considered parts.", body: "Scroll to separate each component.", items: [{ title: "Outer shell", body: "[What protects it]" }, { title: "Core", body: "[What powers it]" }, { title: "Details", body: "[What makes it unique]" }] };
    case "pinned-story":
      return {
        type,
        eyebrow: "How it works",
        heading: `The ${B} story in three steps.`,
        items: [
          { title: "Discover", body: `See what makes ${B} different at a glance.`, meta: "01" },
          { title: "Experience", body: c.audience ? `Designed around ${c.audience}.` : "Designed around the people who use it every day.", meta: "02" },
          { title: "Keep going", body: `${c.cta} whenever you are ready.`, meta: "03" },
        ],
      };
    case "features":
      return {
        type,
        eyebrow: "Why it matters",
        heading: `What ${B} brings.`,
        items: [
          { title: "Considered design", body: "Every detail is there for a reason." },
          { title: "Made for you", body: c.audience ? `Built with ${c.audience} in mind.` : "Built around real needs, not features for their own sake." },
          { title: "Ready when you are", body: "[Add a concrete benefit your customers care about.]" },
        ],
      };
    case "kinetic-type":
      return { type, heading: B, items: [{ title: HERO_LINES[c.industry]?.replace(/\.$/, "") ?? c.noun }] };
    case "gallery":
      return { type, eyebrow: "Gallery", heading: "A closer look.", imageAssetIds: c.images.slice(0, 8), items: c.images.length ? undefined : [{ title: "[Image one]" }, { title: "[Image two]" }, { title: "[Image three]" }] };
    case "horizontal-cases":
      return {
        type,
        eyebrow: "Selected work",
        heading: c.industry === "portfolio" || c.industry === "agency" || c.industry === "architecture" ? "Projects." : "Highlights.",
        items: [
          { title: "[Project one]", body: "[One line about the brief and the outcome.]", meta: "[Year]", imageAssetId: c.images[0] },
          { title: "[Project two]", body: "[One line about the brief and the outcome.]", meta: "[Year]", imageAssetId: c.images[1] },
          { title: "[Project three]", body: "[One line about the brief and the outcome.]", meta: "[Year]", imageAssetId: c.images[2] },
          { title: "[Project four]", body: "[One line about the brief and the outcome.]", meta: "[Year]", imageAssetId: c.images[3] },
        ],
      };
    case "abstract-scene":
      return { type, eyebrow: B, heading: HERO_LINES[c.industry] ?? "Move through it.", body: "Move your pointer to interact." };
    case "specs":
      return { type, eyebrow: "Details", heading: c.industry === "event" ? "The essentials." : "The specifics.", items: c.industry === "event" ? [{ title: "Date", body: "[Date]" }, { title: "Venue", body: "[Venue]" }, { title: "Format", body: "[In person / online]" }] : [{ title: "[Detail]", body: "[Value]" }, { title: "[Detail]", body: "[Value]" }, { title: "[Detail]", body: "[Value]" }] };
    case "pricing":
      return { type, eyebrow: "Pricing", heading: "Simple plans.", body: "Replace the placeholders with your real prices.", items: [{ title: "Starter", meta: "[$ / month]", body: "[Feature]\n[Feature]\n[Feature]" }, { title: "Pro", meta: "[$ / month]", body: "[Everything in Starter]\n[Feature]\n[Feature]" }], ctaLabel: c.cta };
    case "faq":
      return {
        type,
        eyebrow: "FAQ",
        heading: "Questions, answered.",
        items: [
          { title: `What is ${B}?`, body: c.brandDescription ? firstSentence(c.brandDescription, 300) : `[Explain ${B} in one or two sentences.]` },
          { title: "Who is it for?", body: c.audience || "[Describe who it is for.]" },
          { title: "How do I get started?", body: `${c.cta} using the button on this page.` },
        ],
      };
    case "cta":
      return { type, eyebrow: B, heading: c.industry === "event" ? "Save your seat." : `Ready for ${B}?`, ctaLabel: c.cta };
    case "contact":
      return { type, eyebrow: "Contact", heading: "Let's talk.", body: "Tell us about your project and we will get back to you." };
    case "scroll-film":
      return { type, eyebrow: B, heading: HERO_LINES[c.industry] ?? `Meet ${B}.` };
  }
}

export function createRulesPlan(prompt: string, config: WebsiteConfig, assets: AssetSummary[]): AIPlan {
  const resolved = resolveAutoConfig({ prompt, config, assets });
  const industry = detectIndustry({ prompt, config, assets });
  const direction = getDirection(resolved.direction);
  const brand = config.brand.brandName.trim() || extractBrandName(prompt) || "Your Brand";
  const ctx: CopyCtx = {
    brand,
    noun: NOUN[industry],
    industry,
    audience: config.brand.audience.trim(),
    description: (config.brand.description || prompt).trim(),
    brandDescription: config.brand.description.trim(),
    cta: config.brand.primaryCta.trim() || (industry === "event" ? "Get tickets" : industry === "saas" || industry === "app" ? "Start free" : industry === "agency" || industry === "portfolio" ? "Start a project" : "Discover more"),
    images: config.brand.imageAssetIds.length ? config.brand.imageAssetIds : assets.filter((a) => a.kind === "image").map((a) => a.id),
  };
  const sections = resolved.brand.sections.map((t) => sectionContent(t, ctx));
  return {
    title: `${brand} — ${HERO_LINES[industry]?.replace(/\.$/, "") ?? ctx.noun}`.slice(0, 60),
    description: firstSentence(ctx.description, 155) || `${brand}.`,
    brandName: brand,
    tagline: HERO_LINES[industry] ?? ctx.noun,
    ctaLabel: ctx.cta,
    direction: direction.id === "custom" ? "custom" : direction.id,
    palette: direction.palette,
    displayFont: direction.fonts.display,
    bodyFont: direction.fonts.body,
    typeScale: direction.id === "minimal-editorial" || direction.id === "luxury" ? "large" : "standard",
    scene: {
      enabled: resolved.scene.enabled,
      modelId: resolved.scene.subject === "uploaded" ? "uploaded" : (resolved.scene.modelId ?? "torus-knot"),
      placement: resolved.scene.placement === "auto" ? "hero" : resolved.scene.placement,
      material: resolved.scene.material,
      lighting: resolved.scene.lighting,
      framing: (resolved.scene.framing === "auto" ? "three-quarter" : resolved.scene.framing) as AIPlan["scene"]["framing"],
      autoRotate: resolved.scene.autoRotate,
      pointer: resolved.scene.pointerInteraction,
      scrollCamera: resolved.scene.scrollCamera,
      exploded: resolved.scene.explodedView,
      quality: resolved.scene.quality === "auto" ? "medium" : resolved.scene.quality,
      mobile: resolved.scene.mobile,
    },
    motion: {
      intensity: resolved.motion.intensity === "auto" ? "balanced" : resolved.motion.intensity,
      smoothScroll: resolved.motion.smoothScroll,
      pinned: resolved.motion.pinnedSections,
      parallax: resolved.motion.parallax,
      horizontal: resolved.motion.horizontalSections,
      textReveals: resolved.motion.textReveals,
      stagger: resolved.motion.staggeredEntrances,
      imageTransitions: resolved.motion.imageTransitions,
      particles: resolved.motion.particles,
      hover: resolved.motion.hoverInteractions,
      cursor: resolved.motion.customCursor,
      transition: resolved.motion.sectionTransition === "auto" ? "slide-up" : resolved.motion.sectionTransition,
    },
    sections,
    imageAlts: assets.filter((a) => a.kind === "image").map((a) => ({ assetId: a.id, alt: a.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ") })),
    notes: [
      `Composed with Centixio's rule-based planner for a ${NOUN[industry]} site (no AI provider configured), so copy is templated.`,
      "Bracketed text marks facts only you can provide; edit them in chat or connect an AI provider for tailored copy.",
    ],
  };
}
