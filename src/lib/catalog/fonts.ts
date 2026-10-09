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

export const FONTS: FontDef[] = [
  { family: "Instrument Serif", category: "serif", axes: "ital@0;1", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Fraunces", category: "serif", axes: "opsz,wght@9..144,300..800", fallback: "Georgia, serif" },
  { family: "Cormorant Garamond", category: "serif", axes: "wght@300;400;500;600", fallback: "Garamond, Georgia, serif" },
  { family: "Playfair Display", category: "serif", axes: "wght@400..800", fallback: "Georgia, serif" },
  { family: "DM Serif Display", category: "serif", axes: "ital@0;1", fallback: "Georgia, serif" },
  { family: "Unbounded", category: "display", axes: "wght@300..800", fallback: "system-ui, sans-serif" },
  { family: "Syne", category: "display", axes: "wght@400..800", fallback: "system-ui, sans-serif" },
  { family: "Archivo Black", category: "display", axes: "", fallback: "Impact, 'Arial Black', sans-serif" },
  { family: "Bricolage Grotesque", category: "display", axes: "opsz,wght@12..96,300..800", fallback: "system-ui, sans-serif" },
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
  { id: "serif-editorial", name: "Instrument Serif + Inter Tight", display: "Instrument Serif", body: "Inter Tight" },
  { id: "modern-serif", name: "Fraunces + Inter", display: "Fraunces", body: "Inter" },
  { id: "luxe", name: "Cormorant Garamond + Manrope", display: "Cormorant Garamond", body: "Manrope" },
  { id: "classic", name: "Playfair Display + Inter", display: "Playfair Display", body: "Inter" },
  { id: "future", name: "Unbounded + Space Grotesk", display: "Unbounded", body: "Space Grotesk" },
  { id: "tech", name: "Sora + Inter", display: "Sora", body: "Inter" },
  { id: "expressive", name: "Syne + Manrope", display: "Syne", body: "Manrope" },
  { id: "friendly", name: "Bricolage Grotesque + Outfit", display: "Bricolage Grotesque", body: "Outfit" },
  { id: "raw", name: "Archivo Black + IBM Plex Mono", display: "Archivo Black", body: "IBM Plex Mono" },
  { id: "poster", name: "Bebas Neue + Inter", display: "Bebas Neue", body: "Inter" },
];

export function getFont(family: string): FontDef {
  return FONTS.find((f) => f.family === family) ?? FONTS.find((f) => f.family === "Inter")!;
}

export function isKnownFont(family: string): boolean {
  return FONTS.some((f) => f.family === family);
}

export function googleFontsHref(families: string[]): string {
  const unique = Array.from(new Set(families)).filter(isKnownFont);
  const params = unique
    .map((family) => {
      const def = getFont(family);
      const name = family.replace(/ /g, "+");
      return `family=${name}${def.axes ? `:${def.axes}` : ""}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
