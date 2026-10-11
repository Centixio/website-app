import "server-only";
import { env } from "@/lib/env";
import { ProviderError } from "./provider";

/**
 * Image generation adapter. Generated pages get bespoke, subject-matched
 * imagery (a car brief gets cars) instead of an unrelated stock 3D object.
 */
export type ImageAspect = "landscape" | "portrait" | "square";

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: "image/webp" | "image/png" | "image/jpeg";
  model: string;
}

export interface ImageProvider {
  label: string;
  generate(prompt: string, aspect: ImageAspect, signal?: AbortSignal): Promise<GeneratedImage>;
}

const SIZES: Record<ImageAspect, string> = { landscape: "1536x1024", portrait: "1024x1536", square: "1024x1024" };

/** Appended to every prompt: keeps output usable as website art and avoids trademark/likeness problems. */
const HOUSE_STYLE =
  "Premium editorial photography for a high-end website, cinematic lighting, shallow depth of field, rich but natural color grading, generous negative space for overlaid headline text. No text, letters, logos, badges, watermarks or UI. No recognizable real brands, trademarks or real people.";

class OpenAIImages implements ImageProvider {
  readonly label: string;
  constructor(
    private key: string,
    private model: string,
    private quality: "low" | "medium" | "high",
  ) {
    this.label = `OpenAI (${model})`;
  }

  async generate(prompt: string, aspect: ImageAspect, signal?: AbortSignal): Promise<GeneratedImage> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt: `${prompt.trim()}\n\n${HOUSE_STYLE}`.slice(0, 3800),
      size: SIZES[aspect],
      quality: this.quality,
      n: 1,
      output_format: "webp",
      output_compression: 82,
    };
    let res = await this.call(body, signal);
    if (res.status === 400) {
      // Older/newer models may not accept every output option; retry with the minimal request.
      delete body.output_format;
      delete body.output_compression;
      res = await this.call(body, signal);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      throw new ProviderError(`Image generation failed (${res.status}). ${detail}`, retryable, res.status === 429 ? "rate_limited" : res.status === 400 ? "refused" : "unavailable");
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[]; output_format?: string };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError("Image generation returned no image.", true);
    const format = json.output_format ?? (body.output_format as string | undefined) ?? "png";
    const mimeType = format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png";
    return { bytes: new Uint8Array(Buffer.from(b64, "base64")), mimeType, model: this.model };
  }

  private call(body: Record<string, unknown>, signal?: AbortSignal) {
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  }
}

export function getImageProvider(): ImageProvider | null {
  const key = env.openaiApiKey();
  return key ? new OpenAIImages(key, env.openaiImageModel(), env.openaiImageQuality()) : null;
}

export function imageProviderConfigured(): boolean {
  return Boolean(env.openaiApiKey());
}
