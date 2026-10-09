import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AIPlanSchema, type AIPlan } from "@/lib/spec/schema";
import { env } from "@/lib/env";
import { SYSTEM_PROMPT, briefMessage, editMessage, repairMessage } from "./prompts";
import { ProviderError, type AIProvider, type EditRequest, type PlanRequest, type ReferenceImage, type RepairRequest } from "./provider";

const RecommendationNotesSchema = z.object({
  items: z.array(z.object({ id: z.string(), explanation: z.string() })),
});

/**
 * Claude via the official Anthropic SDK. Uses structured outputs so every
 * response is validated against the plan schema, and server-side refusal
 * fallbacks so a policy decline is retried on Anthropic's recommended model.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly isAI = true;
  readonly label: string;
  private client: Anthropic;
  private model: string;

  constructor() {
    this.model = env.anthropicModel();
    this.label = `Claude (${this.model})`;
    this.client = new Anthropic({ apiKey: env.anthropicApiKey(), maxRetries: 2, timeout: 10 * 60 * 1000 });
  }

  private async call<T>(schema: z.ZodType<T>, userText: string, reference: ReferenceImage | null | undefined, maxTokens: number, signal?: AbortSignal): Promise<T> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (reference) content.push({ type: "image", source: { type: "base64", media_type: reference.mediaType, data: reference.base64 } });
    content.push({ type: "text", text: userText });
    try {
      const res = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: maxTokens,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          output_config: { effort: env.anthropicEffort(), format: betaZodOutputFormat(schema) },
          messages: [{ role: "user", content }],
        },
        { signal },
      );
      if (res.stop_reason === "refusal") {
        throw new ProviderError("The AI provider declined this request. Try rephrasing the brief.", false, "refused");
      }
      if (res.stop_reason === "max_tokens") {
        throw new ProviderError("The AI response was cut off before it finished.", true, "invalid_output");
      }
      if (!res.parsed_output) throw new ProviderError("The AI response did not match the expected format.", true, "invalid_output");
      return res.parsed_output as T;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError("The AI provider is rate limiting requests.", true, "rate_limited");
      if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) throw new ProviderError("The AI provider is temporarily unavailable.", true, "unavailable");
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new ProviderError("The AI provider rejected the server's credentials.", false, "bad_request");
      if (err instanceof Anthropic.BadRequestError) throw new ProviderError(`The AI provider rejected the request: ${err.message}`.slice(0, 300), false, "bad_request");
      if (err instanceof Anthropic.APIError) throw new ProviderError(`AI provider error (${err.status ?? "network"}).`, true, "unavailable");
      if (err instanceof Error && /JSON|parse|schema/i.test(err.message)) throw new ProviderError("The AI response did not match the expected format.", true, "invalid_output");
      throw err;
    }
  }

  plan(req: PlanRequest, signal?: AbortSignal): Promise<AIPlan> {
    const text = briefMessage({ prompt: req.prompt, settings: req.config, assets: req.assets.map(assetForPrompt), baseline: req.baseline, hasReference: Boolean(req.reference) });
    return this.call(AIPlanSchema, text, req.reference, 16000, signal);
  }

  edit(req: EditRequest, signal?: AbortSignal): Promise<AIPlan> {
    const text = editMessage({ instruction: req.instruction, scope: req.scope, current: req.current, settings: req.config, assets: req.assets.map(assetForPrompt), prompt: req.prompt });
    return this.call(AIPlanSchema, text, req.reference, 16000, signal);
  }

  repair(req: RepairRequest, signal?: AbortSignal): Promise<AIPlan> {
    return this.call(AIPlanSchema, repairMessage(req.plan, req.problems), null, 16000, signal);
  }

  async refineRecommendations(input: { prompt: string; recs: { id: string; title: string; explanation: string }[] }, signal?: AbortSignal) {
    const text = [
      "Rewrite each recommendation's explanation in one or two plain-English sentences tailored to this brief. Do not change or add settings, and do not make claims about results.",
      "<brief>",
      input.prompt,
      "</brief>",
      "<recommendations>",
      JSON.stringify(input.recs.map((r) => ({ id: r.id, title: r.title, explanation: r.explanation }))),
      "</recommendations>",
    ].join("\n");
    const out = await this.call(RecommendationNotesSchema, text, null, 4000, signal);
    return out.items;
  }
}

function assetForPrompt(a: { id: string; kind: string; name: string; meta: Record<string, unknown> }) {
  return { id: a.id, kind: a.kind, name: a.name, separable: a.meta.separable ?? undefined, parts: a.meta.meshCount ?? undefined };
}
