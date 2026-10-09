import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { EXAMPLES } from "@/examples";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? brand.fallbackUrl).replace(/\/$/, "");
  const pages = ["", "/pricing", "/gallery", "/sign-up", "/terms", "/privacy"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  const samples = EXAMPLES.map((e) => ({ url: `${base}/examples/${e.slug}/site`, changeFrequency: "monthly" as const, priority: 0.5 }));
  return [...pages, ...samples];
}
