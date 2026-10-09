import { HttpError, requireUuid, withSession } from "@/lib/api/http";
import { exportSingleFile, exportZip } from "@/lib/pipeline/render";

export const maxDuration = 60;

/** Downloads are free and never touch the credit ledger. */
export const GET = withSession<{ projectId: string; versionId: string }>(async ({ req, session, params }) => {
  const projectId = requireUuid(params.projectId, "project");
  const v = await session.store.getVersion(projectId, requireUuid(params.versionId, "version"));
  if (!v) throw new HttpError(404, "not_found", "Version not found.");
  const format = new URL(req.url).searchParams.get("format") === "single-html" ? "single-html" : "zip";
  const assets = await session.store.listAssets(projectId);
  const read = (a: (typeof assets)[number]) => session.store.readAsset(a);
  let result;
  try {
    result = format === "single-html" ? await exportSingleFile(v.spec, assets, read) : await exportZip(v.spec, assets, read);
  } catch (err) {
    throw new HttpError(422, "export_failed", err instanceof Error ? err.message : "Export failed.");
  }
  return new Response(Buffer.from(result.body), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
