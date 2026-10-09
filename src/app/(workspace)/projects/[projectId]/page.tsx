import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getProvider } from "@/lib/ai";
import { diffConfig } from "@/lib/credits/estimate";
import { Uuid } from "@/lib/api/http";
import { Workspace } from "@/components/workspace/workspace";
import { SiteFontsLoader } from "@/components/shared/font-loader";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage(props: PageProps<"/projects/[projectId]">) {
  const { projectId } = await props.params;
  if (!Uuid.safeParse(projectId).success) notFound();
  const { store, user } = await requireSession(`/projects/${projectId}`);
  const project = await store.getProject(projectId);
  if (!project) notFound();
  const [versions, jobs, messages, config, credits, assets] = await Promise.all([
    store.listVersions(projectId),
    store.listActiveJobs(projectId),
    store.listMessages(projectId),
    store.getConfig(projectId),
    store.credits(),
    store.listAssets(projectId),
  ]);
  const { provider, reason } = getProvider();
  const aiLabel = provider ? (provider.isAI ? `Uses ${provider.label}` : `${provider.label} — templated copy; add an AI key for tailored results`) : "Generation unavailable";
  return (
    <>
      <SiteFontsLoader />
      <Workspace
        initial={{
          project,
          versions,
          jobs,
          messages,
          config: { ...config, diff: diffConfig(config.appliedConfig, config.config) },
          credits,
          assets: assets.map(({ storagePath: _s, sha256: _h, ...a }) => a),
        }}
        aiLabel={aiLabel}
        aiAvailable={Boolean(provider?.isAI)}
        generationUnavailable={reason}
        demo={user.mode === "demo"}
      />
    </>
  );
}
