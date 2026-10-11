import type { WebsiteConfig } from "@/lib/config-schema";
import type { DesignSpec } from "@/lib/spec/schema";
import type { AssetSummary } from "@/lib/recommend/engine";

export type JobStatus = "queued" | "running" | "validating" | "completed" | "failed" | "canceled";
export type JobKind = "generate" | "edit" | "repair";
export type VersionKind = "generate" | "edit" | "reassemble" | "restore" | "repair";

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  updatedAt: string;
  createdAt: string;
  currentVersionId: string | null;
  /** Small subset of the current spec for thumbnails. */
  thumb: { palette: DesignSpec["palette"]; heading: string; modelId: string | null; direction: string; display: string } | null;
}

export interface ProjectConfigRecord {
  config: WebsiteConfig;
  appliedConfig: WebsiteConfig | null;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface VersionSummary {
  id: string;
  number: number;
  kind: VersionKind;
  prompt: string;
  creditCharge: number;
  provider: string;
  createdAt: string;
  runtimeStatus: "unknown" | "ok" | "errors";
}

export interface Version extends VersionSummary {
  projectId: string;
  parentVersionId: string | null;
  config: WebsiteConfig;
  spec: DesignSpec;
  html: string;
  assetRefs: string[];
  notes: string[];
  runtimeErrors: { message: string; where?: string }[];
  jobId: string | null;
}

export interface NewVersion {
  kind: VersionKind;
  prompt: string;
  config: WebsiteConfig;
  spec: DesignSpec;
  html: string;
  asset_refs: string[];
  credit_charge: number;
  provider: string;
  notes: string[];
  parent_version_id: string | null;
}

export interface Asset extends AssetSummary {
  projectId: string;
  mimeType: string;
  storagePath: string;
  sha256: string;
  createdAt: string;
}

export interface Job {
  id: string;
  projectId: string;
  userId: string;
  kind: JobKind;
  status: JobStatus;
  stage: string;
  input: JobInput;
  cost: number;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  resultVersionId: string | null;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobInput {
  prompt: string;
  /** Chat instruction for edits. */
  instruction?: string;
  editScope?: "small" | "major";
  config: WebsiteConfig;
  baseVersionId?: string | null;
  messageId?: string | null;
}

export interface CreditSummary {
  subscription: number;
  purchased: number;
  total: number;
  held: number;
  subscriptionExpiresAt: string | null;
}

export interface LedgerEntry {
  id: string;
  type: string;
  deltaAvailable: number;
  deltaHeld: number;
  description: string;
  createdAt: string;
  jobId: string | null;
}

export interface Subscription {
  id: string;
  plan: "starter" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface EnqueueParams {
  projectId: string;
  kind: JobKind;
  input: JobInput;
  cost: number;
  idempotencyKey: string;
  maxConcurrent: number;
  maxPerHour: number;
}

export class StoreError extends Error {
  constructor(
    public code: "not_found" | "insufficient_credits" | "concurrency_limit" | "rate_limited" | "job_not_owned" | "invalid" | "conflict" | "setup_required",
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Per-user data access. Every method is scoped to the authenticated user. */
export interface UserStore {
  readonly userId: string;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary | null>;
  createProject(input: { name: string; prompt: string; config: WebsiteConfig }): Promise<ProjectSummary>;
  renameProject(projectId: string, name: string): Promise<void>;
  updatePrompt(projectId: string, prompt: string): Promise<void>;
  duplicateProject(projectId: string): Promise<ProjectSummary>;
  deleteProject(projectId: string): Promise<void>;

  getConfig(projectId: string): Promise<ProjectConfigRecord>;
  saveConfig(projectId: string, config: WebsiteConfig): Promise<void>;

  listMessages(projectId: string): Promise<Message[]>;
  addUserMessage(projectId: string, content: string, metadata?: Record<string, unknown>): Promise<Message>;
  addAssistantMessage(projectId: string, content: string, metadata?: Record<string, unknown>): Promise<void>;

  listVersions(projectId: string): Promise<VersionSummary[]>;
  getVersion(projectId: string, versionId: string): Promise<Version | null>;
  createFreeVersion(projectId: string, version: NewVersion, message: string, syncConfig: boolean): Promise<string>;
  reportRuntime(projectId: string, versionId: string, status: "ok" | "errors", errors: { message: string; where?: string }[]): Promise<void>;

  listAssets(projectId: string): Promise<Asset[]>;
  getAsset(assetId: string): Promise<Asset | null>;
  createAsset(input: { projectId: string; kind: Asset["kind"]; name: string; mimeType: string; bytes: Uint8Array; sha256: string; meta: Asset["meta"] }): Promise<Asset>;
  deleteAsset(assetId: string): Promise<void>;
  /** Short-lived URL a sandboxed preview can load without cookies. */
  signedAssetUrl(asset: Asset, ttlSeconds: number): Promise<string>;
  readAsset(asset: Asset): Promise<Uint8Array>;

  enqueueJob(params: EnqueueParams): Promise<Job>;
  getJob(jobId: string): Promise<Job | null>;
  listActiveJobs(projectId: string): Promise<Job[]>;
  cancelJob(jobId: string): Promise<string>;

  credits(): Promise<CreditSummary>;
  ledger(limit: number): Promise<LedgerEntry[]>;
  subscription(): Promise<Subscription | null>;
  checkRateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean>;
}

/** Privileged operations used by job workers (never exposed to clients). */
export interface WorkerStore {
  claimJob(workerId: string, leaseSeconds: number, jobId?: string): Promise<Job | null>;
  heartbeat(jobId: string, workerId: string, stage: string, leaseSeconds: number): Promise<boolean>;
  completeJob(jobId: string, workerId: string, version: NewVersion, message: string, syncConfig: boolean): Promise<string | null>;
  failJob(jobId: string, workerId: string, error: string, retryable: boolean): Promise<string>;
  sweep(timeoutSeconds: number): Promise<Record<string, number>>;
  /** Load what a worker needs, bypassing RLS (the job row identifies the owner). */
  loadJobContext(job: Job): Promise<{ assets: Asset[]; baseVersion: Version | null; readAsset(a: Asset): Promise<Uint8Array> }>;
}
