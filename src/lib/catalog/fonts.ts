/**
 * Curated Google Fonts available to generated websites. Exports load them from
 * fonts.googleapis.com (a disclosed remote dependency) and fall back to the
 * listed system stack when offline.
 */
export interface FontDef {
  family: string;
  category: "serif" | "sans" | "display" | "mono";
  /** Google Fonts css2 axis spec, e.g. "wght@400;600" or "ital,wght@0,400;1,400". */
  axes: string;
  fallback: string;
}

/**
 * Selectable fonts: premium SIL Open Font License families only, chosen for
 * contemporary landing pages. Template-default faces (Playfair, Bebas, Inter…)
 * are retired. Fontshare/ITF fonts such as Satoshi are deliberately absent:
 * their license forbids offering them to users of a site builder.
 */
export const FONTS: FontDef[] = [
  { family: "Instrument Serif", category: "serif", axes: "ital@0;1", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Fraunces", category: "serif", axes: "opsz,wght@9..144,300..800", fallback: "Georgia, serif" },
  { family: "Newsreader", category: "serif", axes: "ital,opsz,wght@0,6..72,300..800;1,6..72,300..800", fallback: "Georgia, serif" },
  { family: "Funnel Display", category: "display", axes: "wght@300..800", fallback: "system-ui, sans-serif" },
  { family: "Bricolage Grotesque", category: "display", axes: "opsz,wght@12..96,300..800", fallback: "system-ui, sans-serif" },
  { family: "Unbounded", category: "display", axes: "wght@300..800", fallback: "system-ui, sans-serif" },
  { family: "Schibsted Grotesk", category: "display", axes: "wght@400..900", fallback: "system-ui, sans-serif" },
  { family: "Geist", category: "sans", axes: "wght@300..800", fallback: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { family: "Instrument Sans", category: "sans", axes: "wght@400..700", fallback: "system-ui, sans-serif" },
  { family: "Hanken Grotesk", category: "sans", axes: "wght@300..800", fallback: "system-ui, sans-serif" },
  { family: "Host Grotesk", category: "sans", axes: "wght@300..800", fallback: "system-ui, sans-serif" },
  { family: "Funnel Sans", category: "sans", axes: "wght@300..800", fallback: "system-ui, sans-serif" },
  { family: "Geist Mono", category: "mono", axes: "wght@400..700", fallback: "ui-monospace, Menlo, monospace" },
];

/** Retired fonts, kept only so previously saved designs still render. Never offered. */
const LEGACY_FONTS: FontDef[] = [
  { family: "Cormorant Garamond", category: "serif", axes: "wght@300;400;500;600", fallback: "Garamond, Georgia, serif" },
  { family: "Playfair Display", category: "serif", axes: "wght@400..800", fallback: "Georgia, serif" },
  { family: "DM Serif Display", category: "serif", axes: "ital@0;1", fallback: "Georgia, serif" },
  { family: "Syne", category: "display", axes: "wght@400..800", fallback: "system-ui, sans-serif" },
  { family: "Archivo Black", category: "display", axes: "", fallback: "Impact, 'Arial Black', sans-serif" },
  { family: "Bebas Neue", category: "display", axes: "", fallback: "Impact, sans-serif" },
  { family: "Sora", category: "sans", axes: "wght@300..700", fallback: "system-ui, sans-serif" },
  { family: "Space Grotesk", category: "sans", axes: "wght@300..700", fallback: "system-ui, sans-serif" },
  { family: "Inter Tight", category: "sans", axes: "wght@300..700", fallback: "system-ui, sans-serif" },
  { family: "Inter", category: "sans", axes: "wght@300..700", fallback: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { family: "Manrope", category: "sans", axes: "wght@300..700", fallback: "system-ui, sans-serif" },
  { family: "Outfit", category: "sans", axes: "wght@300..700", fallback: "system-ui, sans-serif" },
  { family: "IBM Plex Mono", category: "mono", axes: "wght@400;500;600", fallback: "ui-monospace, Menlo, monospace" },
  { family: "JetBrains Mono", category: "mono", axes: "wght@400;500;700", fallback: "ui-monospace, Menlo, monospace" },
];

export const FONT_PAIRINGS: { id: string; name: string; display: string; body: string }[] = [
  { id: "auto", name: "Auto — recommended", display: "", body: "" },
  { id: "serif-editorial", name: "Instrument Serif + Instrument Sans", display: "Instrument Serif", body: "Instrument Sans" },
  { id: "modern-serif", name: "Fraunces + Geist", display: "Fraunces", body: "Geist" },
  { id: "luxe", name: "Instrument Serif + Hanken Grotesk", display: "Instrument Serif", body: "Hanken Grotesk" },
  { id: "newsprint", name: "Newsreader + Geist", display: "Newsreader", body: "Geist" },
  { id: "precise", name: "Geist + Geist", display: "Geist", body: "Geist" },
  { id: "future", name: "Unbounded + Host Grotesk", display: "Unbounded", body: "Host Grotesk" },
  { id: "tech", name: "Schibsted Grotesk + Geist", display: "Schibsted Grotesk", body: "Geist" },
  { id: "expressive", name: "Funnel Display + Funnel Sans", display: "Funnel Display", body: "Funnel Sans" },
  { id: "friendly", name: "Bricolage Grotesque + Instrument Sans", display: "Bricolage Grotesque", body: "Instrument Sans" },
  { id: "raw", name: "Funnel Display + Geist Mono", display: "Funnel Display", body: "Geist Mono" },
];

export function getFont(family: string): FontDef {
  return FONTS.find((f) => f.family === family) ?? LEGACY_FONTS.find((f) => f.family === family) ?? FONTS.find((f) => f.family === "Geist")!;
}

export function isKnownFont(family: string): boolean {
  return FONTS.some((f) => f.family === family);
}

export function googleFontsHref(families: string[]): string {
  const unique = Array.from(new Set(families)).filter((f) => isKnownFont(f) || LEGACY_FONTS.some((l) => l.family === f));
  const params = unique
    .map((family) => {
      const def = getFont(family);
      const name = family.replace(/ /g, "+");
      return `family=${name}${def.axes ? `:${def.axes}` : ""}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
