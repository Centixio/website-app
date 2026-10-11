import { z } from "zod";
import { body, json, requireUuid, withSession } from "@/lib/api/http";
import { askQuestion } from "@/lib/services/projects";
import { LIMITS } from "@/config/limits";

export const maxDuration = 60;

/** Free chat answers about the page (no version, no credits). */
export const POST = withSession<{ projectId: string }>(async ({ req, session, params }) => {
  const input = await body(req, z.object({ message: z.string().trim().min(2).max(LIMITS.chatMessageMaxChars) }));
  return json(await askQuestion(session, requireUuid(params.projectId, "project"), input));
});
