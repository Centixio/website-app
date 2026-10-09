import { json, requireUuid, withSession } from "@/lib/api/http";
import { restoreVersion } from "@/lib/services/projects";

export const POST = withSession<{ projectId: string; versionId: string }>(async ({ session, params }) => {
  const versionId = await restoreVersion(session, requireUuid(params.projectId, "project"), requireUuid(params.versionId, "version"));
  return json({ versionId });
});
