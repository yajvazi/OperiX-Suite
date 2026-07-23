import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OperiX Suite",
    short_name: "OperiX",
    description: "One connected suite for financial and people operations.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#004FFE",
    icons: [{ src: "/brand/operix-icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
