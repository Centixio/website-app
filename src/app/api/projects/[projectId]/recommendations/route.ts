import { z } from "zod";
import { body, json, requireUuid, withSession } from "@/lib/api/http";
import { recommend } from "@/lib/recommend/engine";
import { assetSummaries } from "@/lib/services/projects";
import { getProvider } from "@/lib/ai";
import { LIMITS } from "@/config/limits";

type P = { projectId: string };

/**
 * Rule-based recommendations are always returned. With `ai: true` and an AI
 * provider configured, explanations are tailored by the model (free, rate
 * limited). The AI never changes the recommended settings themselves.
 */
export const POST = withSession<P>(async ({ req, session, params }) => {
  const id = requireUuid(params.projectId, "project");
  const input = await body(req, z.object({ prompt: z.string().max(LIMITS.prompt.maxChars).default(""), ai: z.boolean().default(false) }));
  const { config } = await session.store.getConfig(id);
  const assets = await assetSummaries(session.store, id);
  let recs = recommend({ prompt: input.prompt, config, assets });
  let aiStatus: "off" | "applied" | "unavailable" | "rate_limited" = "off";
  if (input.ai) {
    const { provider } = getProvider();
    if (!provider?.isAI || !provider.refineRecommendations) aiStatus = "unavailable";
    else if (!(await session.store.checkRateLimit("ai-recs", LIMITS.aiRecommendationsPerHour, 3600))) aiStatus = "rate_limited";
    else {
      try {
        const refined = await provider.refineRecommendations({ prompt: input.prompt, recs }, AbortSignal.timeout(60_000));
        const byId = new Map(refined.map((r) => [r.id, r.explanation]));
        recs = recs.map((r) => (byId.get(r.id) ? { ...r, explanation: byId.get(r.id)!.slice(0, 400), source: "ai" as const } : r));
        aiStatus = "applied";
      } catch {
        aiStatus = "unavailable";
      }
    }
  }
  return json({ recommendations: recs, aiStatus });
});
