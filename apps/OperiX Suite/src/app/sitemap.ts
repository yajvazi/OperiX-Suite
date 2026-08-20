import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operixsuite.com";
  const routes = [
    "",
    "/products/invoice",
    "/products/hr",
    "/products/booking",
    "/products/desk",
    "/products/control",
    "/products/suite",
    "/solutions/finance",
    "/solutions/people",
    "/solutions/bookings",
    "/solutions/workplace",
    "/solutions/small-business",
    "/demo",
    "/enterprise",
    "/features",
    "/pricing",
    "/resources",
    "/about",
    "/contact",
    "/book-demo",
    "/privacy",
    "/terms",
  ];
  return routes.flatMap((route) => {
    const shared = {
      lastModified: new Date(),
      changeFrequency: route === "" ? "weekly" as const : "monthly" as const,
      priority: route === "" ? 1 : route.startsWith("/products") ? .9 : .7,
      alternates: {
        languages: {
          en: `${baseUrl}/en${route}`,
          sq: `${baseUrl}/al${route}`,
        },
      },
    };

    const localized = [
      { url: `${baseUrl}/en${route}`, ...shared },
      { url: `${baseUrl}/al${route}`, ...shared },
    ];
    return route === "" ? [{ url: baseUrl, ...shared }, ...localized] : [{ url: `${baseUrl}${route}`, ...shared }, ...localized];
  });
}
