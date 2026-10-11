import "server-only";
import type { AIPlan } from "@/lib/spec/schema";
import type { Asset, Job, WorkerStore } from "@/lib/data/types";
import type { ImageAspect, ImageProvider } from "@/lib/ai/images";

const GEN_PREFIX = "gen:";

export interface ImageryResult {
  plan: AIPlan;
  created: Asset[];
  /** Keys whose generation failed (their references were removed from the plan). */
  failed: string[];
}

type PlanSection = AIPlan["sections"][number];

/**
 * Generates the images a plan art-directed (at most `budget`), stores them as
 * project assets and swaps the plan's "gen:<key>" references for real asset ids.
 * Images that fail are dropped from the plan rather than failing the page.
 */
export async function materializeImagery(opts: {
  plan: AIPlan;
  budget: number;
  job: Job;
  worker: WorkerStore;
  provider: ImageProvider;
  signal?: AbortSignal;
}): Promise<ImageryResult> {
  const { budget, job, worker, provider, signal } = opts;
  const seen = new Set<string>();
  const wanted = (opts.plan.imagery ?? [])
    .map((img) => ({ ...img, key: normalizeKey(img.key) }))
    .filter((img) => img.key && img.prompt.trim().length > 10 && !seen.has(img.key) && seen.add(img.key))
    .slice(0, Math.max(0, budget));

  const ids = new Map<string, string>();
  const alts: { assetId: string; alt: string }[] = [];
  const created: Asset[] = [];
  const failed: string[] = [];

  await Promise.all(
    wanted.map(async (img) => {
      try {
        const out = await provider.generate(img.prompt, img.aspect as ImageAspect, signal);
        const asset = await worker.createGeneratedImage(job, {
          name: `${img.key}.${out.mimeType === "image/webp" ? "webp" : out.mimeType === "image/jpeg" ? "jpg" : "png"}`,
          mimeType: out.mimeType,
          bytes: out.bytes,
          meta: { generated: true, prompt: img.prompt.slice(0, 1000), ...dimensions(img.aspect as ImageAspect) },
        });
        ids.set(img.key, asset.id);
        alts.push({ assetId: asset.id, alt: img.alt.slice(0, 200) });
        created.push(asset);
      } catch (err) {
        if (signal?.aborted) throw err;
        console.error("[imagery]", job.id, img.key, err instanceof Error ? err.message : err);
        failed.push(img.key);
      }
    }),
  );

  const resolve = (ref: string | undefined): string | undefined => {
    if (!ref) return undefined;
    if (!ref.startsWith(GEN_PREFIX)) return ref;
    return ids.get(normalizeKey(ref.slice(GEN_PREFIX.length)));
  };
  const used = new Set<string>();
  const mark = (id: string | undefined) => (id && used.add(id), id);

  let sections: PlanSection[] = opts.plan.sections.map((s) => ({
    ...s,
    imageAssetIds: s.imageAssetIds?.map((r) => mark(resolve(r))).filter((x): x is string => Boolean(x)),
    items: s.items?.map((it) => ({ ...it, imageAssetId: mark(resolve(it.imageAssetId)) })),
  }));

  // Anything generated but not referenced still belongs on the page: hero first, then story steps, then a gallery.
  const leftovers = created.map((a) => a.id).filter((id) => !used.has(id));
  const hero = sections.find((s) => s.type === "hero");
  if (hero && !hero.imageAssetIds?.length && leftovers.length) {
    const preferred = ids.get("hero");
    const pick = preferred && leftovers.includes(preferred) ? preferred : leftovers[0];
    hero.imageAssetIds = [pick];
    leftovers.splice(leftovers.indexOf(pick), 1);
  }
  const story = sections.find((s) => s.type === "pinned-story" && s.items?.length);
  if (story?.items) {
    for (const it of story.items) {
      if (!leftovers.length) break;
      if (!it.imageAssetId) it.imageAssetId = leftovers.shift();
    }
  }
  if (leftovers.length) {
    const gallery = sections.find((s) => s.type === "gallery");
    if (gallery) gallery.imageAssetIds = [...(gallery.imageAssetIds ?? []), ...leftovers.splice(0)];
  }
  sections = sections.map((s) => ({ ...s, imageAssetIds: s.imageAssetIds?.length ? s.imageAssetIds : undefined }));

  return {
    plan: { ...opts.plan, sections, imagery: [], imageAlts: [...(opts.plan.imageAlts ?? []), ...alts] },
    created,
    failed,
  };
}

/** Removes "gen:" references (used when no images are generated at all). */
export function stripGeneratedRefs(plan: AIPlan): AIPlan {
  const real = (r?: string) => (r && !r.startsWith(GEN_PREFIX) ? r : undefined);
  return {
    ...plan,
    imagery: [],
    sections: plan.sections.map((s) => ({
      ...s,
      imageAssetIds: s.imageAssetIds?.filter((r) => !r.startsWith(GEN_PREFIX)),
      items: s.items?.map((it) => ({ ...it, imageAssetId: real(it.imageAssetId) })),
    })),
  };
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/^gen:/, "").replace(/[^a-z0-9-]+/g, "-").slice(0, 40);
}

function dimensions(aspect: ImageAspect): { width: number; height: number } {
  return aspect === "portrait" ? { width: 1024, height: 1536 } : aspect === "square" ? { width: 1024, height: 1024 } : { width: 1536, height: 1024 };
}
