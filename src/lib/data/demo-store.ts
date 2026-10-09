import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { coerceConfig, type WebsiteConfig } from "@/lib/config-schema";
import type { DesignSpec } from "@/lib/spec/schema";
import { env } from "@/lib/env";
import { hmac } from "@/lib/auth/demo-session";
import { DEMO_STARTING_CREDITS } from "@/config/pricing";
import { LIMITS } from "@/config/limits";
import * as L from "@/lib/credits/memory-ledger";
import {
  StoreError,
  type Asset,
  type EnqueueParams,
  type Job,
  type Message,
  type NewVersion,
  type ProjectSummary,
  type UserStore,
  type Version,
  type WorkerStore,
} from "./types";

/**
 * LOCAL DEMO MODE ONLY. A single-process, file-backed store used when
 * Supabase is not configured. Credits here are demo credits with no monetary
 * value; billing is never real in this mode.
 */

interface DemoUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}
interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}
interface ConfigRow {
  userId: string;
  config: WebsiteConfig;
  appliedConfig: WebsiteConfig | null;
  updatedAt: string;
}
interface MessageRow extends Message {
  projectId: string;
  userId: string;
}
interface VersionRow extends Omit<Version, "runtimeErrors"> {
  userId: string;
  runtimeErrors: { message: string; where?: string }[];
}
interface AssetRow extends Asset {
  userId: string;
}
interface JobRow extends Job {
  idempotencyKey: string;
  reservationId: string | null;
  lockedBy: string | null;
  lockedUntil: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}
interface DemoDB {
  users: DemoUser[];
  projects: ProjectRow[];
  configs: Record<string, ConfigRow>;
  messages: MessageRow[];
  versions: VersionRow[];
  assets: AssetRow[];
  jobs: JobRow[];
  credits: L.LedgerState;
  rate: { userId: string; bucket: string; at: number }[];
}

const DIR = process.env.CENTIXIO_DEMO_DIR ?? path.join(process.cwd(), ".demo-data");
const FILE = path.join(DIR, "db.json");
const now = () => new Date().toISOString();

const g = globalThis as unknown as { __cxDemo?: { db: DemoDB; mutex: L.Mutex } };

function load(): { db: DemoDB; mutex: L.Mutex } {
  if (g.__cxDemo) return g.__cxDemo;
  let db: DemoDB = { users: [], projects: [], configs: {}, messages: [], versions: [], assets: [], jobs: [], credits: L.emptyLedger(), rate: [] };
  try {
    db = { ...db, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    /* first run */
  }
  g.__cxDemo = { db, mutex: new L.Mutex() };
  return g.__cxDemo;
}

function persist(db: DemoDB) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

/** Run a mutation serialized and persisted. */
function tx<T>(fn: (db: DemoDB) => T): Promise<T> {
  const state = load();
  return state.mutex.run(() => {
    const result = fn(state.db);
    persist(state.db);
    return result;
  });
}
function read<T>(fn: (db: DemoDB) => T): Promise<T> {
  const state = load();
  return state.mutex.run(() => fn(state.db));
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 32).toString("hex")}`;
}
function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export const demoAuth = {
  async signUp(email: string, password: string): Promise<DemoUser> {
    return tx((db) => {
      const e = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === e)) throw new StoreError("conflict", "An account with this email already exists.");
      const user: DemoUser = { id: crypto.randomUUID(), email: e, passwordHash: hashPassword(password), createdAt: now() };
      db.users.push(user);
      L.grantCredits(db.credits, user.id, "demo", DEMO_STARTING_CREDITS, null, `demo-start:${user.id}`, "Demo credits (no monetary value)");
      return user;
    });
  },
  async signIn(email: string, password: string): Promise<DemoUser | null> {
    return read((db) => {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase());
      return u && checkPassword(password, u.passwordHash) ? u : null;
    });
  },
  async getUser(id: string) {
    return read((db) => db.users.find((u) => u.id === id) ?? null);
  },
  async grantDemoCredits(userId: string, amount: number) {
    return tx((db) => L.grantCredits(db.credits, userId, "demo", amount, null, `demo-topup:${crypto.randomUUID()}`, "Demo top-up (no monetary value)"));
  },
};

function thumb(spec: DesignSpec | undefined): ProjectSummary["thumb"] {
  if (!spec) return null;
  return {
    palette: spec.palette,
    heading: spec.sections[0]?.heading ?? spec.brand.name,
    modelId: spec.scene.enabled && spec.scene.source.type === "catalog" ? spec.scene.source.modelId : null,
    direction: spec.direction,
    display: spec.typography.display,
  };
}

function toSummary(db: DemoDB, p: ProjectRow): ProjectSummary {
  const v = p.currentVersionId ? db.versions.find((x) => x.id === p.currentVersionId) : undefined;
  return { id: p.id, name: p.name, prompt: p.prompt, createdAt: p.createdAt, updatedAt: p.updatedAt, currentVersionId: p.currentVersionId, thumb: thumb(v?.spec) };
}

function insertVersion(db: DemoDB, userId: string, projectId: string, v: NewVersion, jobId: string | null, message: string, syncConfig: boolean): string {
  const p = db.projects.find((x) => x.id === projectId && x.userId === userId);
  if (!p) throw new StoreError("not_found");
  const number = db.versions.filter((x) => x.projectId === projectId).reduce((n, x) => Math.max(n, x.number), 0) + 1;
  const row: VersionRow = {
    id: crypto.randomUUID(),
    userId,
    projectId,
    number,
    kind: v.kind,
    prompt: v.prompt,
    creditCharge: v.credit_charge,
    provider: v.provider,
    createdAt: now(),
    runtimeStatus: "unknown",
    parentVersionId: v.parent_version_id,
    config: v.config,
    spec: v.spec,
    html: v.html,
    assetRefs: v.asset_refs,
    notes: v.notes,
    runtimeErrors: [],
    jobId,
  };
  db.versions.push(row);
  p.currentVersionId = row.id;
  p.updatedAt = now();
  const cfg = db.configs[projectId];
  if (cfg) {
    if (syncConfig) cfg.config = v.config;
    cfg.appliedConfig = v.config;
  }
  if (message) {
    db.messages.push({ id: crypto.randomUUID(), projectId, userId, role: "assistant", content: message.slice(0, 8000), metadata: { version_id: row.id, version_number: number, job_id: jobId, credit_charge: v.credit_charge }, createdAt: now() });
  }
  return row.id;
}

export class DemoUserStore implements UserStore {
  constructor(readonly userId: string) {}

  private own(db: DemoDB, projectId: string) {
    const p = db.projects.find((x) => x.id === projectId && x.userId === this.userId);
    if (!p) throw new StoreError("not_found");
    return p;
  }

  listProjects() {
    return read((db) => db.projects.filter((p) => p.userId === this.userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((p) => toSummary(db, p)));
  }
  getProject(projectId: string) {
    return read((db) => {
      const p = db.projects.find((x) => x.id === projectId && x.userId === this.userId);
      return p ? toSummary(db, p) : null;
    });
  }
  createProject(input: { name: string; prompt: string; config: WebsiteConfig }) {
    return tx((db) => {
      const p: ProjectRow = { id: crypto.randomUUID(), userId: this.userId, name: input.name, prompt: input.prompt, currentVersionId: null, createdAt: now(), updatedAt: now() };
      db.projects.push(p);
      db.configs[p.id] = { userId: this.userId, config: input.config, appliedConfig: null, updatedAt: now() };
      return toSummary(db, p);
    });
  }
  renameProject(projectId: string, name: string) {
    return tx((db) => {
      const p = this.own(db, projectId);
      p.name = name;
      p.updatedAt = now();
    });
  }
  updatePrompt(projectId: string, prompt: string) {
    return tx((db) => {
      this.own(db, projectId).prompt = prompt;
    });
  }
  async duplicateProject(projectId: string) {
    return tx((db) => {
      const src = this.own(db, projectId);
      const copy: ProjectRow = { ...src, id: crypto.randomUUID(), name: `${src.name} (copy)`.slice(0, 80), currentVersionId: null, createdAt: now(), updatedAt: now() };
      db.projects.push(copy);
      const cfg = db.configs[projectId];
      db.configs[copy.id] = { userId: this.userId, config: cfg.config, appliedConfig: null, updatedAt: now() };
      const v = src.currentVersionId ? db.versions.find((x) => x.id === src.currentVersionId) : undefined;
      if (v) {
        insertVersion(db, this.userId, copy.id, { kind: "restore", prompt: v.prompt, config: cfg.config, spec: v.spec, html: v.html, asset_refs: [], credit_charge: 0, provider: v.provider, notes: [`Duplicated from ${src.name} v${v.number}`], parent_version_id: null }, null, `Duplicated from “${src.name}” (version ${v.number}). Uploaded assets were not copied.`, false);
      }
      return toSummary(db, copy);
    });
  }
  deleteProject(projectId: string) {
    return tx((db) => {
      this.own(db, projectId);
      for (const a of db.assets.filter((x) => x.projectId === projectId)) fs.rmSync(path.join(DIR, "assets", a.storagePath), { force: true });
      db.projects = db.projects.filter((p) => p.id !== projectId);
      delete db.configs[projectId];
      db.messages = db.messages.filter((m) => m.projectId !== projectId);
      db.versions = db.versions.filter((v) => v.projectId !== projectId);
      db.assets = db.assets.filter((a) => a.projectId !== projectId);
      db.jobs = db.jobs.filter((j) => j.projectId !== projectId || ["queued", "running", "validating"].includes(j.status));
    });
  }
  getConfig(projectId: string) {
    return read((db) => {
      this.own(db, projectId);
      const c = db.configs[projectId];
      return { config: coerceConfig(c.config), appliedConfig: c.appliedConfig ? coerceConfig(c.appliedConfig) : null, updatedAt: c.updatedAt };
    });
  }
  saveConfig(projectId: string, config: WebsiteConfig) {
    return tx((db) => {
      this.own(db, projectId);
      db.configs[projectId] = { ...db.configs[projectId], config, updatedAt: now() };
    });
  }
  listMessages(projectId: string) {
    return read((db) => {
      this.own(db, projectId);
      return db.messages.filter((m) => m.projectId === projectId).map(({ projectId: _p, userId: _u, ...m }) => m);
    });
  }
  addUserMessage(projectId: string, content: string, metadata: Record<string, unknown> = {}) {
    return tx((db) => {
      this.own(db, projectId);
      const m: MessageRow = { id: crypto.randomUUID(), projectId, userId: this.userId, role: "user", content, metadata, createdAt: now() };
      db.messages.push(m);
      return { id: m.id, role: m.role, content: m.content, metadata: m.metadata, createdAt: m.createdAt } as Message;
    });
  }
  addAssistantMessage(projectId: string, content: string, metadata: Record<string, unknown> = {}) {
    return tx((db) => {
      this.own(db, projectId);
      db.messages.push({ id: crypto.randomUUID(), projectId, userId: this.userId, role: "assistant", content, metadata, createdAt: now() });
    });
  }
  listVersions(projectId: string) {
    return read((db) => {
      this.own(db, projectId);
      return db.versions
        .filter((v) => v.projectId === projectId)
        .sort((a, b) => b.number - a.number)
        .map((v) => ({ id: v.id, number: v.number, kind: v.kind, prompt: v.prompt, creditCharge: v.creditCharge, provider: v.provider, createdAt: v.createdAt, runtimeStatus: v.runtimeStatus }));
    });
  }
  getVersion(projectId: string, versionId: string) {
    return read((db) => {
      const v = db.versions.find((x) => x.id === versionId && x.projectId === projectId && x.userId === this.userId);
      if (!v) return null;
      const { userId: _u, ...rest } = v;
      return { ...rest, config: coerceConfig(rest.config) } as Version;
    });
  }
  createFreeVersion(projectId: string, version: NewVersion, message: string, syncConfig: boolean) {
    if (version.credit_charge !== 0) throw new StoreError("invalid", "free_version_must_cost_zero");
    return tx((db) => insertVersion(db, this.userId, projectId, version, null, message, syncConfig));
  }
  reportRuntime(projectId: string, versionId: string, status: "ok" | "errors", errors: { message: string; where?: string }[]) {
    return tx((db) => {
      const v = db.versions.find((x) => x.id === versionId && x.projectId === projectId && x.userId === this.userId);
      if (!v) throw new StoreError("not_found");
      v.runtimeStatus = status;
      v.runtimeErrors = errors.slice(0, 20);
    });
  }
  listAssets(projectId: string) {
    return read((db) => {
      this.own(db, projectId);
      return db.assets.filter((a) => a.projectId === projectId);
    });
  }
  getAsset(assetId: string) {
    return read((db) => db.assets.find((a) => a.id === assetId && a.userId === this.userId) ?? null);
  }
  createAsset(input: { projectId: string; kind: Asset["kind"]; name: string; mimeType: string; bytes: Uint8Array; sha256: string; meta: Asset["meta"] }) {
    return tx((db) => {
      this.own(db, input.projectId);
      const ext = input.name.match(/\.([a-z0-9]{1,6})$/i)?.[1]?.toLowerCase() ?? "bin";
      const storagePath = `${this.userId}/${input.projectId}/${crypto.randomUUID()}.${ext}`;
      const file = path.join(DIR, "assets", storagePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, input.bytes);
      const a: AssetRow = { id: crypto.randomUUID(), userId: this.userId, projectId: input.projectId, kind: input.kind, name: input.name, mimeType: input.mimeType, sizeBytes: input.bytes.byteLength, storagePath, sha256: input.sha256, meta: input.meta, createdAt: now() };
      db.assets.push(a);
      return a;
    });
  }
  deleteAsset(assetId: string) {
    return tx((db) => {
      const a = db.assets.find((x) => x.id === assetId && x.userId === this.userId);
      if (!a) throw new StoreError("not_found");
      fs.rmSync(path.join(DIR, "assets", a.storagePath), { force: true });
      db.assets = db.assets.filter((x) => x.id !== assetId);
    });
  }
  async signedAssetUrl(asset: Asset, ttlSeconds: number) {
    return demoSignedAssetUrl(asset.id, ttlSeconds);
  }
  async readAsset(asset: Asset) {
    return new Uint8Array(fs.readFileSync(path.join(DIR, "assets", asset.storagePath)));
  }
  enqueueJob(p: EnqueueParams) {
    return tx((db) => {
      const existing = db.jobs.find((j) => j.userId === this.userId && j.idempotencyKey === p.idempotencyKey);
      if (existing) return strip(existing);
      this.own(db, p.projectId);
      const mine = db.jobs.filter((j) => j.userId === this.userId);
      if (mine.filter((j) => ["queued", "running", "validating"].includes(j.status)).length >= p.maxConcurrent) throw new StoreError("concurrency_limit");
      if (mine.filter((j) => Date.parse(j.createdAt) > Date.now() - 3600e3).length >= p.maxPerHour) throw new StoreError("rate_limited");
      const job: JobRow = {
        id: crypto.randomUUID(),
        projectId: p.projectId,
        userId: this.userId,
        kind: p.kind,
        status: "queued",
        stage: "queued",
        input: p.input,
        cost: p.cost,
        attempts: 0,
        maxAttempts: LIMITS.jobMaxAttempts,
        error: null,
        resultVersionId: null,
        cancelRequested: false,
        createdAt: now(),
        updatedAt: now(),
        idempotencyKey: p.idempotencyKey,
        reservationId: null,
        lockedBy: null,
        lockedUntil: null,
        startedAt: null,
        finishedAt: null,
      };
      if (p.cost > 0) {
        try {
          job.reservationId = L.reserve(db.credits, this.userId, p.cost, `job:${job.id}`, job.id, LIMITS.reservationTtlSeconds).id;
        } catch (e) {
          if (e instanceof L.LedgerError && e.code === "insufficient_credits") throw new StoreError("insufficient_credits");
          throw e;
        }
      }
      db.jobs.push(job);
      return strip(job);
    });
  }
  getJob(jobId: string) {
    return read((db) => {
      const j = db.jobs.find((x) => x.id === jobId && x.userId === this.userId);
      return j ? strip(j) : null;
    });
  }
  listActiveJobs(projectId: string) {
    return read((db) => db.jobs.filter((j) => j.projectId === projectId && j.userId === this.userId && ["queued", "running", "validating"].includes(j.status)).map(strip));
  }
  cancelJob(jobId: string) {
    return tx((db) => {
      const j = db.jobs.find((x) => x.id === jobId && x.userId === this.userId);
      if (!j) throw new StoreError("not_found");
      if (j.status === "queued") {
        if (j.reservationId) L.release(db.credits, j.reservationId, "Generation canceled");
        Object.assign(j, { status: "canceled", stage: "canceled", cancelRequested: true, finishedAt: now(), updatedAt: now() });
        return "canceled";
      }
      if (j.status === "running" || j.status === "validating") {
        j.cancelRequested = true;
        return "canceling";
      }
      return j.status;
    });
  }
  credits() {
    return read((db) => L.summary(db.credits, this.userId));
  }
  ledger(limit: number) {
    return read((db) =>
      db.credits.ledger
        .filter((r) => r.userId === this.userId)
        .slice(-limit)
        .reverse()
        .map((r) => ({ id: r.id, type: r.type, deltaAvailable: r.deltaAvailable, deltaHeld: r.deltaHeld, description: r.description, createdAt: new Date(r.createdAt).toISOString(), jobId: r.jobId ?? null })),
    );
  }
  async subscription() {
    return null;
  }
  checkRateLimit(bucket: string, max: number, windowSeconds: number) {
    return tx((db) => {
      const since = Date.now() - windowSeconds * 1000;
      db.rate = db.rate.filter((r) => r.at > Date.now() - 86400e3);
      if (db.rate.filter((r) => r.userId === this.userId && r.bucket === bucket && r.at > since).length >= max) return false;
      db.rate.push({ userId: this.userId, bucket, at: Date.now() });
      return true;
    });
  }
}

function strip(j: JobRow): Job {
  const { idempotencyKey: _k, reservationId: _r, lockedBy: _l, lockedUntil: _u, startedAt: _s, finishedAt: _f, ...rest } = j;
  return { ...rest };
}

export class DemoWorkerStore implements WorkerStore {
  claimJob(workerId: string, leaseSeconds: number, jobId?: string) {
    return tx((db) => {
      const t = Date.now();
      const j = db.jobs
        .filter((x) => (!jobId || x.id === jobId) && !x.cancelRequested && x.attempts < x.maxAttempts && (x.status === "queued" || ((x.status === "running" || x.status === "validating") && (x.lockedUntil ?? 0) < t)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!j) return null;
      Object.assign(j, { status: "running", stage: "starting", lockedBy: workerId, lockedUntil: t + leaseSeconds * 1000, attempts: j.attempts + 1, startedAt: j.startedAt ?? now(), updatedAt: now() });
      return strip(j);
    });
  }
  heartbeat(jobId: string, workerId: string, stage: string, leaseSeconds: number) {
    return tx((db) => {
      const j = db.jobs.find((x) => x.id === jobId);
      if (!j || j.lockedBy !== workerId || !["running", "validating"].includes(j.status)) throw new StoreError("job_not_owned");
      Object.assign(j, { stage, status: stage === "validating" ? "validating" : "running", lockedUntil: Date.now() + leaseSeconds * 1000, updatedAt: now() });
      return j.cancelRequested;
    });
  }
  completeJob(jobId: string, workerId: string, version: NewVersion, message: string, syncConfig: boolean) {
    return tx((db) => {
      const j = db.jobs.find((x) => x.id === jobId);
      if (!j || !["running", "validating"].includes(j.status) || j.lockedBy !== workerId) throw new StoreError("job_not_owned");
      if (j.cancelRequested) {
        if (j.reservationId) L.release(db.credits, j.reservationId, "Generation canceled");
        Object.assign(j, { status: "canceled", stage: "canceled", finishedAt: now(), lockedBy: null, lockedUntil: null, updatedAt: now() });
        return null;
      }
      const vid = insertVersion(db, j.userId, j.projectId, version, j.id, message, syncConfig);
      if (j.reservationId) L.settle(db.credits, j.reservationId);
      Object.assign(j, { status: "completed", stage: "completed", resultVersionId: vid, finishedAt: now(), lockedBy: null, lockedUntil: null, error: null, updatedAt: now() });
      return vid;
    });
  }
  failJob(jobId: string, workerId: string, error: string, retryable: boolean) {
    return tx((db) => {
      const j = db.jobs.find((x) => x.id === jobId);
      if (!j) throw new StoreError("not_found");
      if (["completed", "failed", "canceled"].includes(j.status)) return j.status;
      if (j.lockedBy !== workerId) throw new StoreError("job_not_owned");
      if (retryable && j.attempts < j.maxAttempts && !j.cancelRequested) {
        Object.assign(j, { status: "queued", stage: "retrying", lockedBy: null, lockedUntil: null, error: error.slice(0, 1000), updatedAt: now() });
        return "queued";
      }
      const status = j.cancelRequested ? "canceled" : "failed";
      if (j.reservationId) L.release(db.credits, j.reservationId, status === "canceled" ? "Generation canceled" : "Generation failed — credits returned");
      Object.assign(j, { status, stage: status, error: error.slice(0, 1000), finishedAt: now(), lockedBy: null, lockedUntil: null, updatedAt: now() });
      return status;
    });
  }
  sweep(timeoutSeconds: number) {
    return tx((db) => {
      let jobsFailed = 0;
      const t = Date.now();
      for (const j of db.jobs) {
        if (!["queued", "running", "validating"].includes(j.status)) continue;
        const timedOut = Date.parse(j.createdAt) < t - timeoutSeconds * 1000;
        const lost = j.status !== "queued" && (j.lockedUntil ?? 0) < t && j.attempts >= j.maxAttempts;
        if (timedOut || lost) {
          if (j.reservationId) L.release(db.credits, j.reservationId, "Generation timed out — credits returned");
          Object.assign(j, { status: "failed", stage: "failed", error: timedOut ? "Timed out" : "Worker stopped responding", finishedAt: now(), lockedBy: null, lockedUntil: null });
          jobsFailed++;
        }
      }
      let released = 0;
      for (const r of db.credits.reservations.filter((x) => x.status === "active" && x.expiresAt < t)) {
        const j = db.jobs.find((x) => x.id === r.jobId);
        if (!j || ["completed", "failed", "canceled"].includes(j.status)) {
          L.release(db.credits, r.id, "Reservation expired — credits returned");
          released++;
        }
      }
      return { jobs_failed: jobsFailed, reservations_released: released, grants_expired: L.sweepExpired(db.credits) };
    });
  }
  async loadJobContext(job: Job) {
    return read((db) => {
      const assets = db.assets.filter((a) => a.projectId === job.projectId && a.userId === job.userId);
      const base = job.input.baseVersionId ? db.versions.find((v) => v.id === job.input.baseVersionId && v.projectId === job.projectId) : undefined;
      return {
        assets,
        baseVersion: base ? ({ ...base, config: coerceConfig(base.config) } as Version) : null,
        readAsset: async (a: Asset) => new Uint8Array(fs.readFileSync(path.join(DIR, "assets", a.storagePath))),
      };
    });
  }
}

/** Demo-mode asset URLs: HMAC-signed and short-lived so a sandboxed preview can load them without cookies. */
export function demoSignedAssetUrl(assetId: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${env.appUrl().replace(/\/$/, "")}/api/demo-assets/${assetId}?exp=${exp}&sig=${hmac(`${assetId}.${exp}`)}`;
}

export async function readDemoAssetForSignedRequest(assetId: string, exp: number, sig: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const expected = hmac(`${assetId}.${exp}`);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const a = await read((db) => db.assets.find((x) => x.id === assetId));
  if (!a) return null;
  return { bytes: new Uint8Array(fs.readFileSync(path.join(DIR, "assets", a.storagePath))), mime: a.mimeType };
}
