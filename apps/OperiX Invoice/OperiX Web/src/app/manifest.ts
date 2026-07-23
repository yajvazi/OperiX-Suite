import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OperiX Invoice",
    short_name: "OperiX",
    description: "Smart invoicing and business management.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f9fc",
    theme_color: "#004FFE",
    orientation: "any",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
