import { assembleSite } from "@/lib/assembler";
import { exampleAssetUrl, getExample } from "@/examples";

/** Serves a sample site (fictional brand) for the landing page and gallery. Public, static content. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const example = getExample(slug);
  if (!example) return new Response("Not found", { status: 404 });
  const html = assembleSite(example.spec, { mode: "export-zip", assets: { url: (id) => exampleAssetUrl(id) }, modelUrl: null, scriptBase: "/" });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob: 'self'; media-src 'self' blob: data:; connect-src 'self' data: blob:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
