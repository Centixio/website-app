import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config-schema";
import { createRulesPlan } from "@/lib/ai/rules-planner";
import { materializeImagery } from "@/lib/pipeline/imagery";
import { normalizePlan } from "@/lib/spec/normalize";
import { renderPortable } from "@/lib/pipeline/render";
import type { Asset, Job, WorkerStore } from "@/lib/data/types";
import type { ImageProvider } from "@/lib/ai/images";
import type { AIPlan } from "@/lib/spec/schema";

const BRIEF = "create a simple and modern landing page, for cars";

function fakeWorker(created: Asset[]): WorkerStore {
  return {
    createGeneratedImage: async (job: Job, image: { name: string; mimeType: string; bytes: Uint8Array; meta: Asset["meta"] }) => {
      const a = { id: crypto.randomUUID(), projectId: job.projectId, kind: "image", name: image.name, sizeBytes: image.bytes.byteLength, meta: image.meta, mimeType: image.mimeType, storagePath: "x", sha256: "x", createdAt: new Date().toISOString() } as Asset;
      created.push(a);
      return a;
    },
  } as unknown as WorkerStore;
}

const job = { id: crypto.randomUUID(), projectId: crypto.randomUUID(), userId: crypto.randomUUID() } as Job;
const okProvider: ImageProvider = { label: "fake", generate: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp", model: "fake" }) };

function carPlan(): AIPlan {
  const base = createRulesPlan(BRIEF, DEFAULT_CONFIG, []);
  return {
    ...base,
    scene: { ...base.scene, enabled: true, modelId: "liquid-orb", placement: "hero" },
    sections: [
      { type: "hero", heading: "Quiet power.", imageAssetIds: ["gen:hero"] },
      { type: "pinned-story", heading: "Built around you.", items: [1, 2, 3].map((n) => ({ title: `Step ${n}`, body: "Detail.", imageAssetId: `gen:story-${n}` })) },
      { type: "cta", heading: "Book a test drive." },
    ],
    imagery: [
      { key: "hero", prompt: "A low sleek grand tourer on a wet coastal road at dusk, long lens", alt: "Grand tourer at dusk", aspect: "landscape" },
      ...[1, 2, 3].map((n) => ({ key: `story-${n}`, prompt: `Close detail ${n} of a grand tourer interior and bodywork`, alt: `Detail ${n}`, aspect: "landscape" as const })),
    ],
  };
}

describe("AI imagery", () => {
  it("generates art-directed images, wires them into the plan, and renders a cinematic hero and image story", async () => {
    const created: Asset[] = [];
    const out = await materializeImagery({ plan: carPlan(), budget: 4, job, worker: fakeWorker(created), provider: okProvider });
    expect(created).toHaveLength(4);
    expect(out.failed).toEqual([]);
    const hero = out.plan.sections.find((s) => s.type === "hero")!;
    expect(hero.imageAssetIds).toEqual([created.find((a) => a.name.startsWith("hero"))!.id]);
    expect(JSON.stringify(out.plan)).not.toContain("gen:");

    const summaries = created.map((a) => ({ id: a.id, kind: a.kind, name: a.name, sizeBytes: a.sizeBytes, meta: a.meta }));
    const { spec, fixes } = normalizePlan({ plan: out.plan, config: DEFAULT_CONFIG, assets: summaries, prompt: BRIEF, prefer: "config" });
    // The orb doesn't depict a car, so 3D is dropped instead of showing an unrelated object.
    expect(spec.scene.enabled).toBe(false);
    expect(fixes.join(" ")).toMatch(/doesn't depict this brief/);
    const html = renderPortable(spec, summaries);
    expect(html).toContain("cx-hero--image");
    expect(html).toContain("cx-story-frame");
    expect(html).not.toContain('data-cx-stage="main"');
    expect(html).toContain("Grand tourer at dusk");
  });

  it("never exceeds the paid budget and drops references to images that failed", async () => {
    const created: Asset[] = [];
    let calls = 0;
    const flaky: ImageProvider = {
      label: "flaky",
      generate: async () => {
        calls++;
        if (calls === 2) throw new Error("boom");
        return { bytes: new Uint8Array([1]), mimeType: "image/png", model: "fake" };
      },
    };
    const out = await materializeImagery({ plan: carPlan(), budget: 2, job, worker: fakeWorker(created), provider: flaky });
    expect(calls).toBe(2);
    expect(created).toHaveLength(1);
    expect(out.failed).toHaveLength(1);
    expect(JSON.stringify(out.plan)).not.toContain("gen:");
  });
});
