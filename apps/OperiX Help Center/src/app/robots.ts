import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/paths";

export default function robots(): MetadataRoute.Robots {
  const indexingAllowed = process.env.INDEXING_ALLOWED === "true" && process.env.NODE_ENV === "production";
  return { rules: { userAgent: "*", allow: indexingAllowed ? "/" : undefined, disallow: indexingAllowed ? ["/api/health", "/search"] : "/" }, sitemap: `${siteUrl}/sitemap.xml` };
}
