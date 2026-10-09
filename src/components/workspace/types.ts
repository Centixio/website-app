import type { WebsiteConfig } from "@/lib/config-schema";
import type { ConfigDiff, CostEstimate } from "@/lib/credits/estimate";
import type { Asset, CreditSummary, Job, Message, ProjectSummary, VersionSummary } from "@/lib/data/types";

export type PublicAsset = Omit<Asset, "storagePath" | "sha256">;
export type PublicJob = Omit<Job, "input">;

export interface WorkspaceState {
  project: ProjectSummary;
  versions: VersionSummary[];
  jobs: Job[];
  messages: Message[];
  config: { config: WebsiteConfig; appliedConfig: WebsiteConfig | null; updatedAt: string; diff: ConfigDiff };
  credits: CreditSummary;
  assets: PublicAsset[];
}

export interface EstimateResponse {
  estimate: CostEstimate | null;
  credits: CreditSummary;
  diff?: ConfigDiff;
}

export const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting for a worker",
  retrying: "Retrying after a temporary error",
  starting: "Starting",
  planning: "Planning the design",
  building: "Assembling sections and 3D scene",
  validating: "Validating the output",
  saving: "Saving the new version",
  completed: "Done",
  failed: "Failed",
  canceled: "Canceled",
};

export function stageLabel(stage: string): string {
  if (stage.startsWith("repairing")) return `Repairing validation issues ${stage.replace("repairing", "").trim()}`;
  return STAGE_LABELS[stage] ?? stage;
}

export const STAGE_ORDER = ["queued", "planning", "building", "validating", "saving"];
