import "server-only";
import crypto from "node:crypto";
import { LIMITS } from "@/config/limits";
import { getWorkerStore } from "@/lib/data/worker-store";
import { processJob } from "./process-job";

/**
 * Job execution entry points. The durable state lives in the database
 * (generation_jobs with leases), so any of these can crash safely: an
 * expired lease makes the job claimable again, and the sweeper fails jobs
 * that exceed their attempts or timeout and releases their credits.
 *
 * - runJobNow: claim a specific job right after enqueue (used via next/server `after`).
 * - drainQueue: claim and run queued jobs until a deadline (cron route, worker script).
 */
export function workerId(prefix = "web"): string {
  return `${prefix}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function runJobNow(jobId: string): Promise<void> {
  const worker = getWorkerStore();
  const id = workerId("inline");
  const job = await worker.claimJob(id, LIMITS.jobLeaseSeconds, jobId);
  if (job) await processJob(job, worker, id);
}

export async function drainQueue(opts: { deadlineMs: number; maxJobs?: number; prefix?: string }): Promise<{ processed: number; sweep: Record<string, number> }> {
  const worker = getWorkerStore();
  const sweep = await worker.sweep(LIMITS.jobTimeoutSeconds);
  const id = workerId(opts.prefix ?? "drain");
  let processed = 0;
  while (Date.now() < opts.deadlineMs && processed < (opts.maxJobs ?? 10)) {
    const job = await worker.claimJob(id, LIMITS.jobLeaseSeconds);
    if (!job) break;
    await processJob(job, worker, id);
    processed++;
  }
  return { processed, sweep };
}
