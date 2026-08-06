import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "OperiX Support", short_name: "Support", start_url: "/dashboard", display: "standalone", background_color: "#f7f9fc", theme_color: "#004ffe", icons: [] };
}
