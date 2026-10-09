import "server-only";
import { z } from "zod";
import { LIMITS } from "@/config/limits";
import { WebsiteConfigSchema, type WebsiteConfig } from "@/lib/config-schema";
import { getProvider } from "@/lib/ai";
import { ProviderError, type ReferenceImage } from "@/lib/ai/provider";
import { createRulesPlan } from "@/lib/ai/rules-planner";
import { normalizePlan, specToPlan } from "@/lib/spec/normalize";
import { validateOutput } from "@/lib/spec/validate";
import type { AIPlan, DesignSpec } from "@/lib/spec/schema";
import type { AssetSummary } from "@/lib/recommend/engine";
import { StoreError, type Job, type WorkerStore } from "@/lib/data/types";
import { referencedAssetIds, renderPortable } from "./render";

const JobInputSchema = z.object({
  prompt: z.string().min(1).max(LIMITS.prompt.maxChars),
  instruction: z.string().max(LIMITS.chatMessageMaxChars).optional(),
  editScope: z.enum(["small", "major"]).optional(),
  config: WebsiteConfigSchema,
  baseVersionId: z.string().uuid().nullable().optional(),
});

class CanceledError extends Error {}

/**
 * Executes one claimed job end to end. Stages are persisted as they happen
 * (planning → building → validating → saving) so progress shown to the user
 * is real. Credits are settled only by `completeJob`, atomically with saving
 * the version; every failure path releases the reservation.
 */
export async function processJob(job: Job, worker: WorkerStore, workerId: string): Promise<void> {
  const abort = new AbortController();
  let stage = "starting";
  let canceled = false;

  const beat = async () => {
    const cancel = await worker.heartbeat(job.id, workerId, stage, LIMITS.jobLeaseSeconds);
    if (cancel && !canceled) {
      canceled = true;
      abort.abort();
    }
  };
  const setStage = async (s: string) => {
    stage = s;
    await beat();
    if (canceled) throw new CanceledError();
  };
  const timer = setInterval(() => beat().catch(() => abort.abort()), 20_000);

  try {
    const input = JobInputSchema.parse(job.input);
    const config: WebsiteConfig = input.config;
    await setStage("planning");

    const { provider, reason } = getProvider();
    if (!provider) throw new ProviderError(reason ?? "No generation provider", false, "unavailable");

    const ctx = await worker.loadJobContext(job);
    const assets: AssetSummary[] = ctx.assets.map((a) => ({ id: a.id, kind: a.kind, name: a.name, sizeBytes: a.sizeBytes, meta: a.meta }));
    const reference = await loadReference(config, ctx);

    let plan: AIPlan;
    let prefer: "config" | "plan" = "config";
    if (job.kind === "generate") {
      const baseline = createRulesPlan(input.prompt, config, assets);
      plan = provider.isAI ? await provider.plan({ prompt: input.prompt, config, assets, baseline, reference }, abort.signal) : baseline;
    } else {
      if (!ctx.baseVersion) throw new ProviderError("The version to edit no longer exists.", false, "bad_request");
      const current = specToPlan(ctx.baseVersion.spec);
      if (job.kind === "repair") {
        plan = current;
      } else {
        plan = await provider.edit({ instruction: input.instruction ?? "", scope: input.editScope ?? "small", current, prompt: input.prompt, config, assets, reference }, abort.signal);
        prefer = "plan";
      }
    }
    if (canceled) throw new CanceledError();

    await setStage("building");
    let built = build(plan, config, assets, input.prompt, prefer);

    await setStage("validating");
    const known = new Set(ctx.assets.map((a) => a.id));
    let result = validateOutput(built.spec, built.html, known, `${input.prompt}\n${input.instruction ?? ""}`);
    for (let attempt = 0; !result.ok && attempt < LIMITS.maxRepairAttempts; attempt++) {
      if (!provider.isAI) break;
      await setStage(`repairing (${attempt + 1}/${LIMITS.maxRepairAttempts})`);
      plan = await provider.repair({ plan, problems: result.errors }, abort.signal);
      built = build(plan, config, assets, input.prompt, prefer);
      await setStage("validating");
      result = validateOutput(built.spec, built.html, known, `${input.prompt}\n${input.instruction ?? ""}`);
    }
    if (!result.ok) {
      throw new ProviderError(`The generated site did not pass validation: ${result.errors.slice(0, 3).join(" ")}`, false, "invalid_output");
    }

    await setStage("saving");
    const charge = job.cost;
    const message = composeMessage(job, built.spec, built.fixes, provider.label, provider.isAI, charge);
    await worker.completeJob(
      job.id,
      workerId,
      {
        kind: job.kind,
        prompt: job.kind === "generate" ? input.prompt : (input.instruction ?? ""),
        config: built.config,
        spec: built.spec,
        html: built.html,
        asset_refs: referencedAssetIds(built.spec),
        credit_charge: charge,
        provider: provider.label,
        notes: [...built.spec.notes, ...built.fixes].slice(0, 10),
        parent_version_id: input.baseVersionId ?? null,
      },
      message,
      prefer === "plan",
    );
  } catch (err) {
    if (err instanceof StoreError && err.code === "job_not_owned") return; // lease lost; another worker or the sweeper owns it now
    if (err instanceof CanceledError || canceled) {
      await worker.failJob(job.id, workerId, "Canceled by user", false).catch(() => {});
      return;
    }
    const retryable = err instanceof ProviderError ? err.retryable : !(err instanceof z.ZodError);
    const message = err instanceof ProviderError ? err.message : err instanceof z.ZodError ? "Invalid job input." : "Unexpected error while generating.";
    if (!(err instanceof ProviderError)) console.error("[job]", job.id, err);
    await worker.failJob(job.id, workerId, message, retryable).catch((e) => console.error("[job] failJob", e));
  } finally {
    clearInterval(timer);
  }
}

function build(plan: AIPlan, config: WebsiteConfig, assets: AssetSummary[], prompt: string, prefer: "config" | "plan") {
  const { spec, fixes, config: effective } = normalizePlan({ plan, config, assets, prompt, prefer });
  const html = renderPortable(spec, assets);
  return { spec, fixes, config: effective, html };
}

async function loadReference(config: WebsiteConfig, ctx: Awaited<ReturnType<WorkerStore["loadJobContext"]>>): Promise<ReferenceImage | null> {
  const id = config.brand.referenceAssetId;
  const asset = id ? ctx.assets.find((a) => a.id === id && a.kind === "reference") : undefined;
  if (!asset || asset.sizeBytes > 5 * 1024 * 1024) return null;
  const mediaType = asset.mimeType as ReferenceImage["mediaType"];
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)) return null;
  const bytes = await ctx.readAsset(asset);
  return { mediaType, base64: Buffer.from(bytes).toString("base64") };
}

function composeMessage(job: Job, spec: DesignSpec, fixes: string[], providerLabel: string, isAI: boolean, charge: number): string {
  const lines: string[] = [];
  if (job.kind === "generate") lines.push(`Your site is ready: a ${spec.direction.replace(/-/g, " ")} design with ${spec.sections.length} sections${spec.scene.enabled ? " and an interactive 3D scene" : ""}.`);
  else if (job.kind === "repair") lines.push("I rebuilt the site to fix the preview errors.");
  else lines.push("Done — I've updated the site.");
  for (const n of spec.notes.slice(0, 4)) lines.push(`• ${n}`);
  for (const f of fixes.slice(0, 3)) lines.push(`• ${f}`);
  lines.push(`${isAI ? `Generated with ${providerLabel}` : providerLabel}. ${charge > 0 ? `${charge} credits charged.` : "No credits charged."}`);
  return lines.join("\n");
}
