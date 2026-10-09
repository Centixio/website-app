import { json, requireUuid, withSession } from "@/lib/api/http";
import { previewHtml } from "@/lib/services/projects";

/**
 * Returns the preview document as data. The client renders it with
 * <iframe sandbox="allow-scripts" srcdoc>, giving it an opaque origin with no
 * access to this app's cookies, storage, or authenticated APIs.
 */
export const GET = withSession<{ projectId: string; versionId: string }>(async ({ req, session, params }) => {
  const origin = new URL(req.url).origin;
  return json(await previewHtml(session, requireUuid(params.projectId, "project"), requireUuid(params.versionId, "version"), origin));
});
