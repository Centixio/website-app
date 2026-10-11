import { describe, expect, it } from "vitest";
import { classifyEdit, diffConfig, estimateEdit, estimateGeneration, isComplex3d } from "@/lib/credits/estimate";
import { CREDIT_COSTS, IMAGE_BUDGET } from "@/config/pricing";
import { modelFitsBrief } from "@/lib/catalog/models";

const NO_IMAGES = { aiImages: false };
const IMAGES = { aiImages: true };
import { DEFAULT_CONFIG, mergeConfig, resolveConflicts } from "@/lib/config-schema";

describe("cost estimation", () => {
  it("charges the complex 3D surcharge only for complex scenes", () => {
    expect(estimateGeneration(DEFAULT_CONFIG, NO_IMAGES).total).toBe(CREDIT_COSTS.initialGeneration);
    const complex = mergeConfig(DEFAULT_CONFIG, { scene: { explodedView: true, modelId: "headphones" } });
    expect(isComplex3d(complex).complex).toBe(true);
    expect(estimateGeneration(complex, NO_IMAGES).total).toBe(CREDIT_COSTS.initialGeneration + CREDIT_COSTS.complex3dSurcharge);
    const off = mergeConfig(DEFAULT_CONFIG, { scene: { enabled: false, explodedView: true } });
    expect(isComplex3d(off).complex).toBe(false);
  });

  it("classifies edits deterministically", () => {
    for (const s of ["Make the scroll more dramatic", "Use a different 3D model", "Change the colors to black and gold", "Reduce animation on mobile", "Add a pricing section", "Make the hero feel more luxurious"]) {
      expect(classifyEdit(s)).toBe("small");
    }
    for (const s of ["Redesign the whole site", "Start over with a brutalist concept", "Try a completely new style", "Translate the site into Spanish"]) {
      expect(classifyEdit(s)).toBe("major");
    }
    expect(estimateEdit("Add a FAQ", NO_IMAGES).total).toBe(CREDIT_COSTS.smallEdit);
    expect(estimateEdit("Redesign everything", NO_IMAGES).total).toBe(CREDIT_COSTS.majorRedesign);
  });

  it("treats open-ended quality requests and imagery requests as a redesign", () => {
    for (const s of ["improve it my 10x", "the hero should have a top tier animation with cars", "it's too simple", "make it look premium", "add photos of the cars"]) {
      expect(classifyEdit(s)).toBe("major");
    }
    for (const s of ["Improve the headline", "Make the button text better"]) expect(classifyEdit(s)).toBe("small");
  });

  it("adds AI image credits only when images can be generated and imagery is on", () => {
    const withImages = estimateGeneration(DEFAULT_CONFIG, IMAGES);
    expect(withImages.total).toBe(CREDIT_COSTS.initialGeneration + IMAGE_BUDGET.generation * CREDIT_COSTS.generatedImage);
    const off = mergeConfig(DEFAULT_CONFIG, { brand: { imagery: "off" } });
    expect(estimateGeneration(off, IMAGES).total).toBe(CREDIT_COSTS.initialGeneration);
    expect(estimateEdit("Redesign everything", IMAGES).total).toBe(CREDIT_COSTS.majorRedesign + IMAGE_BUDGET.majorEdit * CREDIT_COSTS.generatedImage);
    expect(estimateEdit("Add a FAQ", IMAGES).total).toBe(CREDIT_COSTS.smallEdit);
  });

  it("only treats a 3D model as the subject when it depicts the brief", () => {
    expect(modelFitsBrief("liquid-orb", "create a simple and modern landing page, for cars", "generic")).toBe(false);
    expect(modelFitsBrief("perfume-bottle", "Launch page for an amber perfume", "fragrance")).toBe(true);
    expect(modelFitsBrief("headphones", "Wireless headphones with spatial audio", "audio")).toBe(true);
    expect(modelFitsBrief("liquid-orb", "An AI assistant for product teams", "saas")).toBe(true);
    expect(modelFitsBrief("smartphone", "A neighborhood bakery", "generic")).toBe(false);
  });

  it("tiers configuration changes by what they require", () => {
    const base = DEFAULT_CONFIG;
    expect(diffConfig(base, base).tier).toBe("none");
    expect(diffConfig(base, mergeConfig(base, { motion: { intensity: "dramatic" } })).tier).toBe("free");
    expect(diffConfig(base, mergeConfig(base, { direction: "luxury", scene: { modelId: "ring" } })).estimate?.total).toBe(0);
    expect(diffConfig(base, mergeConfig(base, { brand: { sectionsMode: "custom", sections: ["hero", "pricing", "cta"] } })).tier).toBe("small");
    expect(diffConfig(base, mergeConfig(base, { purpose: "gaming" })).tier).toBe("major");
    expect(diffConfig(null, base).tier).toBe("none");
  });

  it("prevents incompatible 3D combinations", () => {
    const c = mergeConfig(DEFAULT_CONFIG, { scene: { explodedView: true, modelId: "torus-knot" } });
    const r = resolveConflicts(c, { modelSeparable: false });
    expect(r.config.scene.explodedView).toBe(false);
    expect(r.notes.join(" ")).toMatch(/single surface/);
    const off = resolveConflicts(mergeConfig(DEFAULT_CONFIG, { scene: { enabled: false, scrollCamera: true } }), { modelSeparable: null });
    expect(off.config.scene.scrollCamera).toBe(false);
    expect(off.config.motion.scrollCamera).toBe(false);
  });
});
