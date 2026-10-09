import "server-only";
import { appMode, env, isAIConfigured } from "@/lib/env";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { RulesProvider } from "./rules-provider";

export interface ProviderAvailability {
  provider: AIProvider | null;
  /** Why generation is unavailable, if it is. */
  reason: string | null;
}

/**
 * Picks the generation provider.
 * - AI configured: the configured provider (Anthropic by default).
 * - Demo mode without AI: the clearly labeled rule-based composer.
 * - Production without AI: generation is disabled unless ALLOW_RULES_COMPOSER=1,
 *   so real credits are never charged for output presented as AI.
 */
export function getProvider(): ProviderAvailability {
  if (isAIConfigured()) {
    switch (env.aiProvider()) {
      case "anthropic":
        return { provider: new AnthropicProvider(), reason: null };
    }
  }
  if (appMode() === "demo" || process.env.ALLOW_RULES_COMPOSER === "1") {
    return { provider: new RulesProvider(), reason: null };
  }
  return { provider: null, reason: "AI generation is not configured on this server. Set ANTHROPIC_API_KEY (and AI_PROVIDER=anthropic)." };
}

export type { AIProvider } from "./provider";
