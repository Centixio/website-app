/** Minimal, safe HTML building helpers for the assembler. All text is escaped. */

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape an attribute value; only allows safe URL schemes for href/src. */
export function safeUrl(url: string | undefined | null): string {
  const v = String(url ?? "").trim();
  if (/^(https?:\/\/|mailto:|tel:|#|assets\/|films\/|data:image\/|data:video\/mp4|data:model\/|data:application\/octet-stream|blob:)/i.test(v)) return esc(v);
  if (/^\/[^/]/.test(v)) return esc(v);
  return "#";
}

/** JSON for a <script type="application/json"> block, safe against </script> breakouts. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Turns plain text with blank lines into paragraphs. */
export function paragraphs(text: string | undefined, className = ""): string {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${className ? ` class="${className}"` : ""}>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function slugify(text: string, fallback = "section"): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return /^[a-z]/.test(s) ? s : `${fallback}-${s}`.slice(0, 40).replace(/-+$/, "") || fallback;
}

/** Relative luminance of a #RRGGBB color. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick black or white text for a given background. */
export function onColor(bg: string): string {
  return contrastRatio(bg, "#0B0B0D") >= contrastRatio(bg, "#FFFFFF") ? "#0B0B0D" : "#FFFFFF";
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}
