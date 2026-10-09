import { appMode } from "@/lib/env";
import { readDemoAssetForSignedRequest } from "@/lib/data/demo-store";

/** Demo mode only: serves an uploaded asset for a valid, unexpired HMAC signature (no cookies needed). */
export async function GET(req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  if (appMode() !== "demo") return new Response("Not found", { status: 404 });
  const { assetId } = await ctx.params;
  const url = new URL(req.url);
  const found = await readDemoAssetForSignedRequest(assetId, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "");
  if (!found) return new Response("Forbidden", { status: 403 });
  return new Response(Buffer.from(found.bytes), {
    headers: {
      "Content-Type": found.mime,
      "Cache-Control": "private, max-age=600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
