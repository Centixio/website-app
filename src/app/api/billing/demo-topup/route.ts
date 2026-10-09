import { HttpError, json, withSession } from "@/lib/api/http";
import { demoAuth } from "@/lib/data/demo-store";

/** Demo mode only: adds demo credits with no monetary value. Real billing never uses this path. */
export const POST = withSession(async ({ session }) => {
  if (session.user.mode !== "demo") throw new HttpError(404, "not_found", "Not available.");
  if (!(await session.store.checkRateLimit("demo-topup", 5, 3600))) throw new HttpError(429, "rate_limited", "Demo top-up limit reached for this hour.");
  await demoAuth.grantDemoCredits(session.user.id, 50);
  return json({ credits: await session.store.credits() });
});
