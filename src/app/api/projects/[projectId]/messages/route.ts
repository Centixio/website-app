import { z } from "zod";
import { body, IdempotencyKey, json, requireUuid, withSession } from "@/lib/api/http";
import { startEdit } from "@/lib/services/projects";
import { LIMITS } from "@/config/limits";

export const maxDuration = 300;
type P = { projectId: string };

export const GET = withSession<P>(async ({ session, params }) => json({ messages: await session.store.listMessages(requireUuid(params.projectId, "project")) }));

export const POST = withSession<P>(async ({ req, session, params }) => {
  const input = await body(req, z.object({ message: z.string().trim().min(2).max(LIMITS.chatMessageMaxChars), idempotencyKey: IdempotencyKey, expectedCost: z.number().int().min(0) }));
  const { job, estimate } = await startEdit(session, requireUuid(params.projectId, "project"), input);
  return json({ job, estimate }, 202);
});
