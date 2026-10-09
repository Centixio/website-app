import { env } from "@/lib/env";
import { drainQueue } from "@/lib/pipeline/runner";

export const maxDuration = 300;

/**
 * Durable job sweeper/runner. Call every minute from Vercel Cron, Supabase
 * pg_cron (pg_net), or any scheduler with `Authorization: Bearer $CRON_SECRET`.
 * Runs queued jobs until shortly before maxDuration, then exits; leases keep
 * concurrent invocations from double-processing.
 */
async function handle(req: Request) {
  const secret = env.cronSecret();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const result = await drainQueue({ deadlineMs: Date.now() + (maxDuration - 60) * 1000, maxJobs: 8, prefix: "cron" });
  return Response.json(result);
}

export const GET = handle;
export const POST = handle;
