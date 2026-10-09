import { appMode, env } from "@/lib/env";

/**
 * Isolated preview shell. The workspace embeds this route in
 * <iframe sandbox="allow-scripts"> (no allow-same-origin), so it runs in an
 * opaque origin: no access to the app's cookies, storage or APIs. The parent
 * posts the generated document, which the shell writes into itself. The CSP
 * below (from this response, not inherited from the app) limits what the
 * generated code can load or contact.
 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const assetOrigins = new Set<string>([origin]);
  if (appMode() === "production" && env.supabaseUrl()) assetOrigins.add(new URL(env.supabaseUrl()!).origin);
  else assetOrigins.add(new URL(env.appUrl()).origin);
  const origins = Array.from(assetOrigins).join(" ");
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${origin}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `img-src data: blob: ${origins}`,
    `connect-src data: blob: ${origins}`,
    "media-src data: blob:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title></head><body style="margin:0;background:#0b0b0d">
<script>
(function () {
  var done = false;
  window.addEventListener("message", function (e) {
    if (done || e.source !== window.parent) return;
    var d = e.data;
    if (!d || d.source !== "centixio-app" || d.type !== "render" || typeof d.html !== "string") return;
    done = true;
    document.open();
    document.write(d.html);
    document.close();
  });
  window.parent.postMessage({ source: "centixio-shell", type: "shell-ready" }, "*");
})();
</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
