/**
 * Centralized brand configuration. Every user-facing occurrence of the product
 * name, tagline, and support contact reads from here so the brand can be
 * replaced in one place. The logo mark lives in `src/components/brand/logo.tsx`
 * and the static files in `public/brand/` + `src/app/icon.svg`.
 */
export const brand = {
  name: "Centixio",
  shortName: "Centixio",
  tagline: "Describe it. Direct it. Ship it in 3D.",
  description:
    "Centixio turns a plain-English brief into an immersive, scroll-driven 3D website you can refine through chat and download as source code.",
  supportEmail: "support@centixio.example",
  /** Used for absolute URLs in metadata when NEXT_PUBLIC_APP_URL is unset. */
  fallbackUrl: "http://localhost:3000",
  colors: {
    ink: "#0B0B0D",
    ivory: "#F3EFE6",
    accent: "#F2B84B",
  },
} as const;

export type Brand = typeof brand;
