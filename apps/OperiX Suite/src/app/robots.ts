import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operixsuite.com";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/book-demo/success"] }, sitemap: `${baseUrl}/sitemap.xml` };
}
