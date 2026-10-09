import crypto from "node:crypto";
import { HttpError, json, requireUuid, withSession } from "@/lib/api/http";
import { validateUpload, UploadError, type AssetKind } from "@/lib/assets/validate";
import { LIMITS } from "@/config/limits";

export const maxDuration = 60;
const KINDS: AssetKind[] = ["image", "logo", "model", "reference", "favicon", "social"];
type P = { projectId: string };

export const GET = withSession<P>(async ({ session, params }) => {
  const assets = await session.store.listAssets(requireUuid(params.projectId, "project"));
  return json({ assets: assets.map(({ storagePath: _s, sha256: _h, ...a }) => a) });
});

export const POST = withSession<P>(async ({ req, session, params }) => {
  const projectId = requireUuid(params.projectId, "project");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > LIMITS.upload.modelMaxBytes + 1024 * 1024) throw new HttpError(413, "too_large", "File is too large.");
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "") as AssetKind;
  if (!(file instanceof File)) throw new HttpError(400, "invalid", "Attach a file.");
  if (!KINDS.includes(kind)) throw new HttpError(400, "invalid", "Unknown asset kind.");
  const existing = await session.store.listAssets(projectId);
  if (existing.length >= LIMITS.upload.maxAssetsPerProject) throw new HttpError(409, "limit", "This project has reached its upload limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let validated;
  try {
    validated = await validateUpload(kind, bytes, file.name);
  } catch (err) {
    if (err instanceof UploadError) throw new HttpError(422, "invalid_file", err.message);
    throw err;
  }
  const name = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload";
  const asset = await session.store.createAsset({
    projectId,
    kind,
    name,
    mimeType: validated.mimeType,
    bytes,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    meta: validated.meta,
  });
  const { storagePath: _s, sha256: _h, ...pub } = asset;
  return json({ asset: pub }, 201);
});
