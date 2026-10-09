import { HttpError, json, requireUuid, withSession } from "@/lib/api/http";

type P = { projectId: string; assetId: string };

/** Short-lived signed URL for showing the user's own asset in the app. */
export const GET = withSession<P>(async ({ session, params }) => {
  const asset = await session.store.getAsset(requireUuid(params.assetId, "asset"));
  if (!asset || asset.projectId !== params.projectId) throw new HttpError(404, "not_found", "Asset not found.");
  return json({ url: await session.store.signedAssetUrl(asset, 600) });
});

export const DELETE = withSession<P>(async ({ session, params }) => {
  const asset = await session.store.getAsset(requireUuid(params.assetId, "asset"));
  if (!asset || asset.projectId !== params.projectId) throw new HttpError(404, "not_found", "Asset not found.");
  await session.store.deleteAsset(asset.id);
  return json({ ok: true });
});
