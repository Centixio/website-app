import { FONTS, googleFontsHref } from "@/lib/catalog/fonts";

/**
 * Loads curated site fonts for previews. By default only the glyphs used by
 * preset swatches ("Aa") are requested, which keeps the payload tiny; pass
 * `families` without `text` to load full fonts (e.g. for project thumbnails).
 */
export function SiteFontsLoader({ families, text = "Aa" }: { families?: string[]; text?: string | null }) {
  const list = families ?? FONTS.filter((f) => f.category !== "mono").map((f) => f.family);
  if (!list.length) return null;
  const href = googleFontsHref(list) + (text ? `&text=${encodeURIComponent(text)}` : "");
  return <link rel="stylesheet" href={href} precedence="default" />;
}
