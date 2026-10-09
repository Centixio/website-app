import { json, requireUuid, withSession } from "@/lib/api/http";
import { diffConfig } from "@/lib/credits/estimate";

/** Everything the workspace needs to resume: project, versions, active jobs, messages, config diff, credits. */
export const GET = withSession<{ projectId: string }>(async ({ session, params }) => {
  const id = requireUuid(params.projectId, "project");
  const { store } = session;
  const project = await store.getProject(id);
  if (!project) return json({ error: { code: "not_found", message: "Project not found." } }, 404);
  const [versions, jobs, messages, config, credits, assets] = await Promise.all([
    store.listVersions(id),
    store.listActiveJobs(id),
    store.listMessages(id),
    store.getConfig(id),
    store.credits(),
    store.listAssets(id),
  ]);
  return json({
    project,
    versions,
    jobs,
    messages,
    config: { ...config, diff: diffConfig(config.appliedConfig, config.config) },
    credits,
    assets: assets.map(({ storagePath: _s, sha256: _h, ...a }) => a),
  });
});
