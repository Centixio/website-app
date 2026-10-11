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
  /** How many new images the plan may request (0 = none). */
  imageBudget: number;
}

/** A chat message given to the AI as conversation context. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface EditRequest {
  instruction: string;
  scope: "small" | "major";
  current: AIPlan;
  prompt: string;
  config: WebsiteConfig;
  assets: AssetSummary[];
  reference?: ReferenceImage | null;
  imageBudget: number;
  /** Recent conversation, oldest first (excluding this instruction). */
  history: ChatTurn[];
}

/** A question about the page, answered in chat without changing anything. */
export interface AnswerRequest {
  question: string;
  prompt: string;
  /** The current design plan, or null before the first generation. */
  current: AIPlan | null;
  history: ChatTurn[];
}

export interface RepairRequest {
  plan: AIPlan;
  problems: string[];
}

export interface AIProvider {
  id: string;
  /** User-facing name ("Centixio AI"); never the vendor's model name. */
  label: string;
  /** Internal identifier stored on versions for debugging, e.g. "anthropic/claude-opus-5-5". */
  modelId: string;
  isAI: boolean;
  plan(req: PlanRequest, signal?: AbortSignal): Promise<AIPlan>;
  edit(req: EditRequest, signal?: AbortSignal): Promise<AIPlan>;
  repair(req: RepairRequest, signal?: AbortSignal): Promise<AIPlan>;
  /** Conversational answer to a question about the page (plain text). */
  answer(req: AnswerRequest, signal?: AbortSignal): Promise<string>;
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
