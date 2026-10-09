import { z } from "zod";
import { body, json, requireUuid, withSession } from "@/lib/api/http";

const Schema = z.object({
  status: z.enum(["ok", "errors"]),
  errors: z.array(z.object({ message: z.string().max(500), where: z.string().max(200).optional() })).max(20).default([]),
});

/** The workspace forwards validated bridge messages from the sandboxed preview. */
export const POST = withSession<{ projectId: string; versionId: string }>(async ({ req, session, params }) => {
  const input = await body(req, Schema);
  await session.store.reportRuntime(requireUuid(params.projectId, "project"), requireUuid(params.versionId, "version"), input.status, input.errors);
  return json({ ok: true });
});
