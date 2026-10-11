/**
 * Netlify Background Function (the "-background" suffix gives it up to 15
 * minutes and an immediate 202). Sweeps timed-out jobs, then claims and runs
 * queued generations until shortly before the limit. Leases make concurrent
 * invocations safe.
 */
import crypto from "node:crypto";
import { drainQueue } from "@/lib/pipeline/runner";
import { runnerToken } from "@/lib/pipeline/background";

const BUDGET_MS = 13 * 60 * 1000;

export default async (req: Request) => {
  const expected = runnerToken();
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!expected || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    console.warn("[job-runner] rejected unauthenticated invocation");
    return;
  }
  const result = await drainQueue({ deadlineMs: Date.now() + BUDGET_MS, maxJobs: 20, prefix: "netlify-bg" });
  console.log("[job-runner]", JSON.stringify(result));
};
