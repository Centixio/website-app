import type { WebsiteConfig } from "@/lib/config-schema";
import type { AIPlan } from "@/lib/spec/schema";
import type { AssetSummary, Recommendation } from "@/lib/recommend/engine";

/**
 * Provider adapter. The product talks only to this interface, so the model
 * vendor can be swapped by adding an implementation and setting AI_PROVIDER.
 */

export interface ReferenceImage {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  base64: string;
}

export interface PlanRequest {
  prompt: string;
  /** Config with "auto" values still present so the model knows what it may choose. */
  config: WebsiteConfig;
  assets: AssetSummary[];
  /** Rule-based starting point the model may improve on. */
  baseline: AIPlan;
  reference?: ReferenceImage | null;
}

export interface EditRequest {
  instruction: string;
  scope: "small" | "major";
  current: AIPlan;
  prompt: string;
  config: WebsiteConfig;
  assets: AssetSummary[];
  reference?: ReferenceImage | null;
}

export interface RepairRequest {
  plan: AIPlan;
  problems: string[];
}

export interface AIProvider {
  id: string;
  /** Shown to users on each version, e.g. "Claude (claude-opus-5-5)". */
  label: string;
  isAI: boolean;
  plan(req: PlanRequest, signal?: AbortSignal): Promise<AIPlan>;
  edit(req: EditRequest, signal?: AbortSignal): Promise<AIPlan>;
  repair(req: RepairRequest, signal?: AbortSignal): Promise<AIPlan>;
  /** Optional: rephrase/re-rank rule recommendations. Must not invent settings. */
  refineRecommendations?(input: { prompt: string; recs: Recommendation[] }, signal?: AbortSignal): Promise<{ id: string; explanation: string }[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public code: "refused" | "rate_limited" | "unavailable" | "invalid_output" | "bad_request" | "not_understood" = "unavailable",
  ) {
    super(message);
  }
}
