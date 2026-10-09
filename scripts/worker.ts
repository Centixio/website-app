/**
 * Long-running job worker for production deployments where request-bound
 * execution is too short (generations can take minutes).
 *
 *   JOB_RUNNER=worker npm run worker
 *
 * Claims queued jobs with a lease (safe to run several workers), heartbeats
 * while working, and sweeps timed-out jobs / expired reservations each loop.
 */
import { drainQueue } from "@/lib/pipeline/runner";

const IDLE_MS = Number(process.env.WORKER_IDLE_MS ?? 2000);
let running = true;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received, finishing current job…`);
    running = false;
  });
}

async function main() {
  console.log("[worker] started");
  while (running) {
    try {
      const { processed, sweep } = await drainQueue({ deadlineMs: Date.now() + 60_000, maxJobs: 5, prefix: "worker" });
      if (processed || Object.values(sweep).some(Boolean)) console.log("[worker]", { processed, sweep });
      if (!processed) await new Promise((r) => setTimeout(r, IDLE_MS));
    } catch (err) {
      console.error("[worker] loop error", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log("[worker] stopped");
}

main();
