/**
 * Netlify Scheduled Function (every minute, see netlify.toml). Recovers jobs a
 * crashed or cut-off invocation left behind: if anything is queued or holds an
 * expired lease, it starts the background runner, which sweeps and processes.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { triggerBackgroundRunner } from "@/lib/pipeline/background";

declare const __CX_SITE_URL__: string;

export default async (req: Request) => {
  const url = env.supabaseUrl();
  const key = env.supabaseServiceKey();
  if (!url || !key) return;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  const { count, error } = await admin
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .or(`status.eq.queued,and(status.in.(running,validating),locked_until.lt.${now})`);
  if (error) {
    console.error("[job-sweeper]", error.message);
    return;
  }
  if (!count) return;
  const site = __CX_SITE_URL__ || new URL(req.url).origin;
  const ok = await triggerBackgroundRunner(site).catch((e) => (console.error("[job-sweeper] trigger failed", e), false));
  console.log("[job-sweeper]", { pending: count, triggered: ok });
};
