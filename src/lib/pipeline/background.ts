import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Netlify runs Next.js route handlers in short-lived functions, too short for a
 * generation (AI planning alone can take a minute). On Netlify, jobs run in a
 * Background Function instead (up to 15 minutes): see netlify/functions-src.
 */
export const BACKGROUND_RUNNER_PATH = "/.netlify/functions/job-runner-background";

/** Site URL baked in at build time on Netlify (next.config env); empty elsewhere. */
export function netlifySiteUrl(): string | null {
  return process.env.CX_NETLIFY_SITE_URL || null;
}

/** Shared secret for invoking the runner, derived from the Supabase service key (no extra env var). */
export function runnerToken(): string | null {
  const key = env.supabaseServiceKey();
  return key ? crypto.createHmac("sha256", key).update("centixio-job-runner").digest("hex") : null;
}

export async function triggerBackgroundRunner(siteUrl: string): Promise<boolean> {
  const token = runnerToken();
  if (!token) return false;
  const res = await fetch(new URL(BACKGROUND_RUNNER_PATH, siteUrl), { method: "POST", headers: { authorization: `Bearer ${token}` } });
  return res.status === 202 || res.ok;
}
