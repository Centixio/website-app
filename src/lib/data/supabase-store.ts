import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceConfig, type WebsiteConfig } from "@/lib/config-schema";
import type { DesignSpec } from "@/lib/spec/schema";
import {
  StoreError,
  type Asset,
  type CreditSummary,
  type EnqueueParams,
  type Job,
  type LedgerEntry,
  type Message,
  type NewVersion,
  type ProjectConfigRecord,
  type ProjectSummary,
  type Subscription,
  type UserStore,
  type Version,
  type VersionSummary,
  type WorkerStore,
} from "./types";
import { LIMITS } from "@/config/limits";

const BUCKET = "project-assets";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function mapError(err: { message?: string; code?: string } | null): never {
  const msg = err?.message ?? "Database error";
  for (const code of ["insufficient_credits", "concurrency_limit", "rate_limited", "job_not_owned"] as const) {
    if (msg.includes(code)) throw new StoreError(code);
  }
  if (msg.includes("project_not_found") || msg.includes("job_not_found")) throw new StoreError("not_found");
  throw new Error(msg);
}

function thumbFrom(spec: DesignSpec | null | undefined): ProjectSummary["thumb"] {
  if (!spec?.palette) return null;
  return {
    palette: spec.palette,
    heading: spec.sections?.[0]?.heading ?? spec.brand?.name ?? "",
    modelId: spec.scene?.enabled && spec.scene.source?.type === "catalog" ? spec.scene.source.modelId : null,
    direction: spec.direction,
    display: spec.typography?.display ?? "Inter",
  };
}

function mapProject(r: Row): ProjectSummary {
  const v = Array.isArray(r.current) ? r.current[0] : r.current;
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    currentVersionId: r.current_version_id,
    thumb: thumbFrom(v?.spec),
  };
}

function mapVersionSummary(r: Row): VersionSummary {
  return { id: r.id, number: r.number, kind: r.kind, prompt: r.prompt, creditCharge: r.credit_charge, provider: r.provider, createdAt: r.created_at, runtimeStatus: r.runtime_status };
}

function mapVersion(r: Row): Version {
  return {
    ...mapVersionSummary(r),
    projectId: r.project_id,
    parentVersionId: r.parent_version_id,
    config: coerceConfig(r.config),
    spec: r.spec,
    html: r.html,
    assetRefs: r.asset_refs ?? [],
    notes: r.notes ?? [],
    runtimeErrors: r.runtime_errors ?? [],
    jobId: r.job_id,
  };
}

function mapAsset(r: Row): Asset {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    name: r.name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    storagePath: r.storage_path,
    sha256: r.sha256,
    meta: r.meta ?? {},
    createdAt: r.created_at,
  };
}

export function mapJob(r: Row): Job {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    kind: r.kind,
    status: r.status,
    stage: r.stage,
    input: r.input,
    cost: r.cost,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    error: r.error,
    resultVersionId: r.result_version_id,
    cancelRequested: r.cancel_requested,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const PROJECT_SELECT = "id, name, prompt, created_at, updated_at, current_version_id, current:project_versions!projects_current_version_fk(spec)";

export class SupabaseUserStore implements UserStore {
  constructor(
    readonly userId: string,
    private db: SupabaseClient,
    private admin: SupabaseClient,
  ) {}

  async listProjects() {
    const { data, error } = await this.db.from("projects").select(PROJECT_SELECT).order("updated_at", { ascending: false });
    if (error) mapError(error);
    return (data ?? []).map(mapProject);
  }

  async getProject(projectId: string) {
    const { data, error } = await this.db.from("projects").select(PROJECT_SELECT).eq("id", projectId).maybeSingle();
    if (error) mapError(error);
    return data ? mapProject(data) : null;
  }

  private async requireProject(projectId: string) {
    const p = await this.getProject(projectId);
    if (!p) throw new StoreError("not_found");
    return p;
  }

  async createProject(input: { name: string; prompt: string; config: WebsiteConfig }) {
    const { data, error } = await this.db.from("projects").insert({ user_id: this.userId, name: input.name, prompt: input.prompt }).select("id").single();
    if (error) mapError(error);
    const id = data.id as string;
    const [c, v] = await Promise.all([
      this.db.from("project_configs").insert({ project_id: id, user_id: this.userId, config: input.config }),
      this.db.from("conversations").insert({ project_id: id, user_id: this.userId }),
    ]);
    if (c.error) mapError(c.error);
    if (v.error) mapError(v.error);
    return (await this.getProject(id))!;
  }

  async renameProject(projectId: string, name: string) {
    const { error, count } = await this.db.from("projects").update({ name }, { count: "exact" }).eq("id", projectId);
    if (error) mapError(error);
    if (!count) throw new StoreError("not_found");
  }

  async updatePrompt(projectId: string, prompt: string) {
    const { error } = await this.db.from("projects").update({ prompt }).eq("id", projectId);
    if (error) mapError(error);
  }

  async duplicateProject(projectId: string) {
    const source = await this.requireProject(projectId);
    const cfg = await this.getConfig(projectId);
    const copy = await this.createProject({ name: `${source.name} (copy)`.slice(0, 80), prompt: source.prompt, config: cfg.config });
    if (source.currentVersionId) {
      const v = await this.getVersion(projectId, source.currentVersionId);
      if (v) {
        // Assets are not copied, so drop references to them in the duplicated version.
        await this.createFreeVersion(
          copy.id,
          { kind: "restore", prompt: v.prompt, config: cfg.config, spec: v.spec, html: v.html, asset_refs: [], credit_charge: 0, provider: v.provider, notes: [`Duplicated from ${source.name} v${v.number}`], parent_version_id: null },
          `Duplicated from “${source.name}” (version ${v.number}). Uploaded assets were not copied.`,
          false,
        );
      }
    }
    return (await this.getProject(copy.id))!;
  }

  async deleteProject(projectId: string) {
    const assets = await this.listAssets(projectId);
    if (assets.length) await this.db.storage.from(BUCKET).remove(assets.map((a) => a.storagePath));
    const { error, count } = await this.db.from("projects").delete({ count: "exact" }).eq("id", projectId);
    if (error) mapError(error);
    if (!count) throw new StoreError("not_found");
  }

  async getConfig(projectId: string): Promise<ProjectConfigRecord> {
    const { data, error } = await this.db.from("project_configs").select("config, applied_config, updated_at").eq("project_id", projectId).maybeSingle();
    if (error) mapError(error);
    if (!data) throw new StoreError("not_found");
    return { config: coerceConfig(data.config), appliedConfig: data.applied_config ? coerceConfig(data.applied_config) : null, updatedAt: data.updated_at };
  }

  async saveConfig(projectId: string, config: WebsiteConfig) {
    const { error, count } = await this.db.from("project_configs").update({ config }, { count: "exact" }).eq("project_id", projectId);
    if (error) mapError(error);
    if (!count) throw new StoreError("not_found");
  }

  async listMessages(projectId: string): Promise<Message[]> {
    const { data, error } = await this.db.from("messages").select("id, role, content, metadata, created_at").eq("project_id", projectId).order("created_at").limit(500);
    if (error) mapError(error);
    return (data ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, metadata: m.metadata ?? {}, createdAt: m.created_at }));
  }

  async addUserMessage(projectId: string, content: string, metadata: Record<string, unknown> = {}) {
    const { data: conv, error: cErr } = await this.db.from("conversations").select("id").eq("project_id", projectId).maybeSingle();
    if (cErr) mapError(cErr);
    if (!conv) throw new StoreError("not_found");
    const { data, error } = await this.db
      .from("messages")
      .insert({ conversation_id: conv.id, project_id: projectId, user_id: this.userId, role: "user", content, metadata })
      .select("id, role, content, metadata, created_at")
      .single();
    if (error) mapError(error);
    return { id: data.id, role: data.role, content: data.content, metadata: data.metadata, createdAt: data.created_at };
  }

  async addAssistantMessage(projectId: string, content: string, metadata: Record<string, unknown> = {}) {
    const { error } = await this.admin.rpc("add_assistant_message", { p_user: this.userId, p_project: projectId, p_content: content, p_metadata: metadata });
    if (error) mapError(error);
  }

  async listVersions(projectId: string) {
    const { data, error } = await this.db
      .from("project_versions")
      .select("id, number, kind, prompt, credit_charge, provider, created_at, runtime_status")
      .eq("project_id", projectId)
      .order("number", { ascending: false })
      .limit(200);
    if (error) mapError(error);
    return (data ?? []).map(mapVersionSummary);
  }

  async getVersion(projectId: string, versionId: string) {
    const { data, error } = await this.db.from("project_versions").select("*").eq("project_id", projectId).eq("id", versionId).maybeSingle();
    if (error) mapError(error);
    return data ? mapVersion(data) : null;
  }

  async createFreeVersion(projectId: string, version: NewVersion, message: string, syncConfig: boolean) {
    await this.requireProject(projectId);
    const { data, error } = await this.admin.rpc("create_free_version", { p_user: this.userId, p_project: projectId, p_version: version, p_message: message, p_sync_config: syncConfig });
    if (error) mapError(error);
    return data as string;
  }

  async reportRuntime(projectId: string, versionId: string, status: "ok" | "errors", errors: { message: string; where?: string }[]) {
    const { error } = await this.db.from("project_versions").update({ runtime_status: status, runtime_errors: errors.slice(0, 20) }).eq("project_id", projectId).eq("id", versionId);
    if (error) mapError(error);
  }

  async listAssets(projectId: string) {
    const { data, error } = await this.db.from("assets").select("*").eq("project_id", projectId).order("created_at");
    if (error) mapError(error);
    return (data ?? []).map(mapAsset);
  }

  async getAsset(assetId: string) {
    const { data, error } = await this.db.from("assets").select("*").eq("id", assetId).maybeSingle();
    if (error) mapError(error);
    return data ? mapAsset(data) : null;
  }

  async createAsset(input: { projectId: string; kind: Asset["kind"]; name: string; mimeType: string; bytes: Uint8Array; sha256: string; meta: Asset["meta"] }) {
    await this.requireProject(input.projectId);
    const ext = input.name.match(/\.([a-z0-9]{1,6})$/i)?.[1]?.toLowerCase() ?? "bin";
    const path = `${this.userId}/${input.projectId}/${crypto.randomUUID()}.${ext}`;
    const up = await this.db.storage.from(BUCKET).upload(path, input.bytes, { contentType: input.mimeType, upsert: false });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    const { data, error } = await this.db
      .from("assets")
      .insert({ user_id: this.userId, project_id: input.projectId, kind: input.kind, name: input.name, storage_path: path, mime_type: input.mimeType, size_bytes: input.bytes.byteLength, sha256: input.sha256, meta: input.meta })
      .select("*")
      .single();
    if (error) {
      await this.db.storage.from(BUCKET).remove([path]);
      mapError(error);
    }
    return mapAsset(data);
  }

  async deleteAsset(assetId: string) {
    const asset = await this.getAsset(assetId);
    if (!asset) throw new StoreError("not_found");
    await this.db.storage.from(BUCKET).remove([asset.storagePath]);
    const { error } = await this.db.from("assets").delete().eq("id", assetId);
    if (error) mapError(error);
  }

  async signedAssetUrl(asset: Asset, ttlSeconds: number) {
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUrl(asset.storagePath, ttlSeconds);
    if (error || !data) throw new Error("Could not sign asset URL");
    return data.signedUrl;
  }

  async readAsset(asset: Asset) {
    const { data, error } = await this.db.storage.from(BUCKET).download(asset.storagePath);
    if (error || !data) throw new Error("Could not read asset");
    return new Uint8Array(await data.arrayBuffer());
  }

  async enqueueJob(p: EnqueueParams) {
    const { data, error } = await this.admin.rpc("enqueue_job", {
      p_user: this.userId,
      p_project: p.projectId,
      p_kind: p.kind,
      p_input: p.input,
      p_cost: p.cost,
      p_key: p.idempotencyKey,
      p_max_concurrent: p.maxConcurrent,
      p_max_per_hour: p.maxPerHour,
      p_reservation_ttl: LIMITS.reservationTtlSeconds,
      p_max_attempts: LIMITS.jobMaxAttempts,
    });
    if (error) mapError(error);
    return mapJob(data as Row);
  }

  async getJob(jobId: string) {
    const { data, error } = await this.db.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) mapError(error);
    return data ? mapJob(data) : null;
  }

  async listActiveJobs(projectId: string) {
    const { data, error } = await this.db.from("generation_jobs").select("*").eq("project_id", projectId).in("status", ["queued", "running", "validating"]).order("created_at");
    if (error) mapError(error);
    return (data ?? []).map(mapJob);
  }

  async cancelJob(jobId: string) {
    const { data, error } = await this.admin.rpc("cancel_job", { p_user: this.userId, p_job: jobId });
    if (error) mapError(error);
    return data as string;
  }

  async credits(): Promise<CreditSummary> {
    const { data, error } = await this.admin.rpc("credit_summary", { p_user: this.userId });
    if (error) mapError(error);
    const s = data as Row;
    return { subscription: s.subscription, purchased: s.purchased, total: s.total, held: s.held, subscriptionExpiresAt: s.subscription_expires_at };
  }

  async ledger(limit: number): Promise<LedgerEntry[]> {
    const { data, error } = await this.db.from("credit_ledger").select("id, entry_type, delta_available, delta_held, description, created_at, job_id").order("id", { ascending: false }).limit(limit);
    if (error) mapError(error);
    return (data ?? []).map((r) => ({ id: String(r.id), type: r.entry_type, deltaAvailable: r.delta_available, deltaHeld: r.delta_held, description: r.description, createdAt: r.created_at, jobId: r.job_id }));
  }

  async subscription(): Promise<Subscription | null> {
    const { data, error } = await this.db
      .from("subscriptions")
      .select("id, plan, status, current_period_end, cancel_at_period_end")
      .in("status", ["active", "trialing", "past_due"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) mapError(error);
    return data ? { id: data.id, plan: data.plan, status: data.status, currentPeriodEnd: data.current_period_end, cancelAtPeriodEnd: data.cancel_at_period_end } : null;
  }

  async checkRateLimit(bucket: string, max: number, windowSeconds: number) {
    const { data, error } = await this.admin.rpc("check_rate_limit", { p_user: this.userId, p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds });
    if (error) mapError(error);
    return Boolean(data);
  }
}

export class SupabaseWorkerStore implements WorkerStore {
  constructor(private admin: SupabaseClient) {}

  async claimJob(workerId: string, leaseSeconds: number, jobId?: string) {
    const { data, error } = await this.admin.rpc("claim_job", { p_worker: workerId, p_lease_seconds: leaseSeconds, p_job: jobId ?? null });
    if (error) mapError(error);
    const rows = (data ?? []) as Row[];
    return rows.length ? mapJob(rows[0]) : null;
  }

  async heartbeat(jobId: string, workerId: string, stage: string, leaseSeconds: number) {
    const { data, error } = await this.admin.rpc("heartbeat_job", { p_job: jobId, p_worker: workerId, p_stage: stage, p_lease_seconds: leaseSeconds });
    if (error) mapError(error);
    return Boolean(data);
  }

  async completeJob(jobId: string, workerId: string, version: NewVersion, message: string, syncConfig: boolean) {
    const { data, error } = await this.admin.rpc("complete_job", { p_job: jobId, p_worker: workerId, p_version: version, p_message: message, p_sync_config: syncConfig });
    if (error) mapError(error);
    return (data as string | null) ?? null;
  }

  async failJob(jobId: string, workerId: string, err: string, retryable: boolean) {
    const { data, error } = await this.admin.rpc("fail_job", { p_job: jobId, p_worker: workerId, p_error: err, p_retryable: retryable });
    if (error) mapError(error);
    return data as string;
  }

  async sweep(timeoutSeconds: number) {
    const { data, error } = await this.admin.rpc("sweep_jobs", { p_timeout_seconds: timeoutSeconds });
    if (error) mapError(error);
    return data as Record<string, number>;
  }

  async loadJobContext(job: Job) {
    const [assets, base] = await Promise.all([
      this.admin.from("assets").select("*").eq("project_id", job.projectId).eq("user_id", job.userId),
      job.input.baseVersionId
        ? this.admin.from("project_versions").select("*").eq("id", job.input.baseVersionId).eq("project_id", job.projectId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (assets.error) mapError(assets.error);
    if (base.error) mapError(base.error);
    return {
      assets: (assets.data ?? []).map(mapAsset),
      baseVersion: base.data ? mapVersion(base.data) : null,
      readAsset: async (a: Asset) => {
        const { data, error } = await this.admin.storage.from(BUCKET).download(a.storagePath);
        if (error || !data) throw new Error("Could not read asset");
        return new Uint8Array(await data.arrayBuffer());
      },
    };
  }
}
