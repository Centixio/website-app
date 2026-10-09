import { z } from "zod";
import { body, json, requireUuid, withSession } from "@/lib/api/http";
import { WebsiteConfigSchema, resolveConflicts } from "@/lib/config-schema";
import { diffConfig } from "@/lib/credits/estimate";
import { getModel } from "@/lib/catalog/models";

type P = { projectId: string };

export const GET = withSession<P>(async ({ session, params }) => {
  const id = requireUuid(params.projectId, "project");
  const rec = await session.store.getConfig(id);
  return json({ ...rec, diff: diffConfig(rec.appliedConfig, rec.config) });
});

/** Saving settings never charges or generates; it only marks them as unapplied. */
export const PUT = withSession<P>(async ({ req, session, params }) => {
  const id = requireUuid(params.projectId, "project");
  const { config } = await body(req, z.object({ config: WebsiteConfigSchema }));
  const assets = await session.store.listAssets(id);
  const uploaded = assets.find((a) => a.id === config.scene.uploadedModelAssetId && a.kind === "model");
  const separable = config.scene.subject === "uploaded" ? (uploaded ? Boolean(uploaded.meta.separable) : null) : config.scene.modelId ? Boolean(getModel(config.scene.modelId)?.separable) : null;
  const { config: fixed, notes } = resolveConflicts(config, { modelSeparable: separable });
  await session.store.saveConfig(id, fixed);
  const rec = await session.store.getConfig(id);
  return json({ ...rec, notes, diff: diffConfig(rec.appliedConfig, rec.config) });
});
