import "server-only";
import crypto from "node:crypto";
import { after } from "next/server";
import { LIMITS } from "@/config/limits";
import { env } from "@/lib/env";
import { getProvider } from "@/lib/ai";
import type { Session } from "@/lib/auth/session";
import { HttpError } from "@/lib/api/http";
import type { AssetSummary } from "@/lib/recommend/engine";
import type { Job, UserStore } from "@/lib/data/types";
import { estimateEdit, estimateGeneration, diffConfig, classifyEdit } from "@/lib/credits/estimate";
import { reapplyConfig, specToPlan } from "@/lib/spec/normalize";
import { validateOutput } from "@/lib/spec/validate";
import { referencedAssetIds, renderPortable, renderPreview } from "@/lib/pipeline/render";
import { runJobNow } from "@/lib/pipeline/runner";
import { demoSignedAssetUrl } from "@/lib/data/demo-store";

export async function assetSummaries(store: UserStore, projectId: string): Promise<AssetSummary[]> {
  return (await store.listAssets(projectId)).map((a) => ({ id: a.id, kind: a.kind, name: a.name, sizeBytes: a.sizeBytes, meta: a.meta }));
}

async function planLimits(store: UserStore) {
  const sub = await store.subscription();
  return { maxConcurrent: LIMITS.concurrentJobs[sub?.plan ?? "free"] ?? 1, maxPerHour: LIMITS.jobsPerHour };
}

function requireProvider() {
  const { provider, reason } = getProvider();
  if (!provider) throw new HttpError(503, "ai_unavailable", reason ?? "Generation is unavailable.");
  return provider;
}

/** Start execution right after the response is sent (inline mode). Durable regardless: workers/cron pick up anything left queued. */
function schedule(job: Job) {
  if (env.jobRunner() !== "inline" || job.status !== "queued") return;
  after(async () => {
    try {
      await runJobNow(job.id);
    } catch (err) {
      console.error("[runner] inline execution failed; job stays queued for a worker", job.id, err);
    }
  });
}

/** The cost the user saw must equal the cost we charge; otherwise ask them to re-confirm. */
function confirmCost(expected: number, actual: number) {
  if (expected !== actual) throw new HttpError(409, "cost_changed", `The cost for this action is now ${actual} credits. Please confirm again.`, { cost: actual });
}

export async function startGeneration(session: Session, projectId: string, input: { prompt: string; idempotencyKey: string; expectedCost: number }) {
  const { store } = session;
  requireProvider();
  const project = await store.getProject(projectId);
  if (!project) throw new HttpError(404, "not_found", "Project not found.");
  const { config } = await store.getConfig(projectId);
  const estimate = estimateGeneration(config);
  confirmCost(input.expectedCost, estimate.total);
  if (input.prompt !== project.prompt) await store.updatePrompt(projectId, input.prompt);
  await store.addUserMessage(projectId, input.prompt, { kind: "brief", idempotency_key: input.idempotencyKey });
  const job = await store.enqueueJob({
    projectId,
    kind: "generate",
    input: { prompt: input.prompt, config, baseVersionId: project.currentVersionId },
    cost: estimate.total,
    idempotencyKey: input.idempotencyKey,
    ...(await planLimits(store)),
  });
  schedule(job);
  return { job, estimate };
}

export async function startEdit(session: Session, projectId: string, input: { message: string; idempotencyKey: string; expectedCost: number; source?: "chat" | "settings" }) {
  const { store } = session;
  requireProvider();
  const project = await store.getProject(projectId);
  if (!project) throw new HttpError(404, "not_found", "Project not found.");
  if (!project.currentVersionId) throw new HttpError(409, "no_version", "Generate the website first, then refine it in chat.");
  const { config } = await store.getConfig(projectId);
  const estimate = estimateEdit(input.message);
  confirmCost(input.expectedCost, estimate.total);
  await store.addUserMessage(projectId, input.message, { kind: input.source === "settings" ? "settings" : "edit", idempotency_key: input.idempotencyKey });
  const job = await store.enqueueJob({
    projectId,
    kind: "edit",
    input: { prompt: project.prompt, instruction: input.message, editScope: classifyEdit(input.message), config, baseVersionId: project.currentVersionId },
    cost: estimate.total,
    idempotencyKey: input.idempotencyKey,
    ...(await planLimits(store)),
  });
  schedule(job);
  return { job, estimate };
}

/** Apply unapplied settings: free re-assembly when possible, otherwise a charged AI edit. */
export async function applyConfig(session: Session, projectId: string, input: { idempotencyKey: string; expectedCost: number }) {
  const { store } = session;
  const project = await store.getProject(projectId);
  if (!project?.currentVersionId) throw new HttpError(409, "no_version", "Generate the website first.");
  const { config, appliedConfig } = await store.getConfig(projectId);
  const diff = diffConfig(appliedConfig, config);
  if (diff.tier === "none") return { kind: "noop" as const };
  confirmCost(input.expectedCost, diff.estimate?.total ?? 0);
  if (diff.tier === "free") {
    const current = await store.getVersion(projectId, project.currentVersionId);
    if (!current) throw new HttpError(404, "not_found", "Current version not found.");
    const assets = await store.listAssets(projectId);
    const summaries = assets.map((a) => ({ id: a.id, kind: a.kind, name: a.name, sizeBytes: a.sizeBytes, meta: a.meta }));
    const { spec, fixes } = reapplyConfig(current.spec, config, summaries, project.prompt);
    const html = renderPortable(spec, assets);
    const check = validateOutput(spec, html, new Set(assets.map((a) => a.id)), project.prompt);
    if (!check.ok) throw new HttpError(422, "invalid_output", `These settings produced an invalid site: ${check.errors[0]}`);
    const versionId = await store.createFreeVersion(
      projectId,
      { kind: "reassemble", prompt: "Applied updated settings", config, spec, html, asset_refs: referencedAssetIds(spec), credit_charge: 0, provider: "Assembler (no AI)", notes: fixes, parent_version_id: current.id },
      `Applied your settings without an AI call (no credits charged).${fixes.length ? `\n• ${fixes.join("\n• ")}` : ""}`,
      false,
    );
    return { kind: "version" as const, versionId };
  }
  const summary = describeChanges(diff.changed);
  const result = await startEdit(session, projectId, { message: `Apply my updated settings: ${summary}. Keep everything else the same.`, idempotencyKey: input.idempotencyKey, expectedCost: diff.estimate!.total, source: "settings" });
  return { kind: "job" as const, job: result.job };
}

function describeChanges(paths: string[]): string {
  const labels = new Set(paths.map((p) => p.split(".").slice(0, 2).join(" ").replace(/([A-Z])/g, " $1").toLowerCase()));
  return Array.from(labels).slice(0, 8).join(", ");
}

export async function restoreVersion(session: Session, projectId: string, versionId: string) {
  const { store } = session;
  const v = await store.getVersion(projectId, versionId);
  if (!v) throw new HttpError(404, "not_found", "Version not found.");
  const assets = await store.listAssets(projectId);
  const known = new Set(assets.map((a) => a.id));
  const missing = v.assetRefs.filter((id) => !known.has(id));
  if (missing.length) throw new HttpError(409, "assets_missing", "This version uses uploaded files that have since been deleted, so it can't be restored.");
  return store.createFreeVersion(
    projectId,
    { kind: "restore", prompt: `Restored version ${v.number}`, config: v.config, spec: v.spec, html: v.html, asset_refs: v.assetRefs, credit_charge: 0, provider: v.provider, notes: [], parent_version_id: v.id },
    `Restored version ${v.number} as the current version. Settings were restored too. No credits charged.`,
    true,
  );
}

/** Free repair after runtime errors in the preview: rebuild the current spec deterministically (bounded per version). */
export async function repairVersion(session: Session, projectId: string, versionId: string, idempotencyKey: string) {
  const { store } = session;
  const v = await store.getVersion(projectId, versionId);
  if (!v) throw new HttpError(404, "not_found", "Version not found.");
  if (v.runtimeStatus !== "errors") throw new HttpError(409, "no_errors", "This version has no reported errors.");
  const allowed = await store.checkRateLimit(`repair:${versionId}`, LIMITS.maxRepairAttempts, 24 * 3600);
  if (!allowed) throw new HttpError(429, "repair_limit", "Automatic repair was already attempted for this version. Try an edit instead.");
  const job = await store.enqueueJob({
    projectId,
    kind: "repair",
    input: { prompt: specToPlan(v.spec).description, config: v.config, baseVersionId: v.id },
    cost: 0,
    idempotencyKey,
    ...(await planLimits(store)),
  });
  schedule(job);
  return job;
}

export async function previewHtml(session: Session, projectId: string, versionId: string, requestOrigin: string) {
  const { store } = session;
  const v = await store.getVersion(projectId, versionId);
  if (!v) throw new HttpError(404, "not_found", "Version not found.");
  const assets = await store.listAssets(projectId);
  const nonce = crypto.randomBytes(16).toString("hex");
  const appOrigin = requestOrigin;
  const assetOrigins = session.user.mode === "production" ? [new URL(env.supabaseUrl()!).origin] : [new URL(env.appUrl()).origin, appOrigin];
  const sign = session.user.mode === "production" ? (a: (typeof assets)[number]) => store.signedAssetUrl(a, 3600) : async (a: (typeof assets)[number]) => demoSignedAssetUrl(a.id, 3600).replace(new URL(env.appUrl()).origin, appOrigin);
  const html = await renderPreview(v.spec, assets, sign, { appOrigin, nonce, assetOrigins });
  return { html, nonce, version: { id: v.id, number: v.number, runtimeStatus: v.runtimeStatus } };
}
