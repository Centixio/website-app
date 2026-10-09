import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? brand.fallbackUrl).replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: ["/", "/examples/"], disallow: ["/api/", "/dashboard", "/projects/", "/billing", "/settings", "/preview-frame", "/auth/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
