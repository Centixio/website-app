import { z } from "zod";
import { body, IdempotencyKey, json, requireUuid, withSession } from "@/lib/api/http";
import { repairVersion } from "@/lib/services/projects";

export const maxDuration = 300;

export const POST = withSession<{ projectId: string; versionId: string }>(async ({ req, session, params }) => {
  const { idempotencyKey } = await body(req, z.object({ idempotencyKey: IdempotencyKey }));
  const job = await repairVersion(session, requireUuid(params.projectId, "project"), requireUuid(params.versionId, "version"), idempotencyKey);
  return json({ job }, 202);
});
