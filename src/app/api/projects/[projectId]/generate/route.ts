import { z } from "zod";
import { body, IdempotencyKey, json, requireUuid, withSession } from "@/lib/api/http";
import { startGeneration } from "@/lib/services/projects";
import { LIMITS } from "@/config/limits";

export const maxDuration = 300;

export const POST = withSession<{ projectId: string }>(async ({ req, session, params }) => {
  const input = await body(
    req,
    z.object({
      prompt: z.string().trim().min(LIMITS.prompt.minChars, `Describe your website in at least ${LIMITS.prompt.minChars} characters.`).max(LIMITS.prompt.maxChars),
      idempotencyKey: IdempotencyKey,
      expectedCost: z.number().int().min(0),
    }),
  );
  const { job, estimate } = await startGeneration(session, requireUuid(params.projectId, "project"), input);
  return json({ job, estimate }, 202);
});
