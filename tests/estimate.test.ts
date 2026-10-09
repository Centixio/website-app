import { describe, expect, it } from "vitest";
import { classifyEdit, diffConfig, estimateEdit, estimateGeneration, isComplex3d } from "@/lib/credits/estimate";
import { CREDIT_COSTS } from "@/config/pricing";
import { DEFAULT_CONFIG, mergeConfig, resolveConflicts } from "@/lib/config-schema";

describe("cost estimation", () => {
  it("charges the complex 3D surcharge only for complex scenes", () => {
    expect(estimateGeneration(DEFAULT_CONFIG).total).toBe(CREDIT_COSTS.initialGeneration);
    const complex = mergeConfig(DEFAULT_CONFIG, { scene: { explodedView: true, modelId: "headphones" } });
    expect(isComplex3d(complex).complex).toBe(true);
    expect(estimateGeneration(complex).total).toBe(CREDIT_COSTS.initialGeneration + CREDIT_COSTS.complex3dSurcharge);
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
    expect(estimateEdit("Add a FAQ").total).toBe(CREDIT_COSTS.smallEdit);
    expect(estimateEdit("Redesign everything").total).toBe(CREDIT_COSTS.majorRedesign);
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
