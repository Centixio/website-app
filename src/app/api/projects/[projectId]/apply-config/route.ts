import { z } from "zod";
import { body, IdempotencyKey, json, requireUuid, withSession } from "@/lib/api/http";
import { applyConfig } from "@/lib/services/projects";

export const maxDuration = 300;

export const POST = withSession<{ projectId: string }>(async ({ req, session, params }) => {
  const input = await body(req, z.object({ idempotencyKey: IdempotencyKey, expectedCost: z.number().int().min(0) }));
  return json(await applyConfig(session, requireUuid(params.projectId, "project"), input));
});
