import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operix.app";
  const routes = ["", "/products/invoice", "/products/hr", "/features", "/pricing", "/resources", "/about", "/contact", "/book-demo", "/privacy", "/terms"];
  return routes.map((route) => ({ url: `${baseUrl}${route}`, lastModified: new Date(), changeFrequency: route === "" ? "weekly" : "monthly", priority: route === "" ? 1 : route.startsWith("/products") ? .9 : .7 }));
}
