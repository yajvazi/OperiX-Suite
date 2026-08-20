import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "OperiX Help Center", short_name: "OperiX Help", description: "Official OperiX Suite documentation and support knowledge base.", start_url: "/en", display: "standalone", background_color: "#f7f8fa", theme_color: "#004ffe", icons: [{ src: "/brand/operix-icon-blue.svg", sizes: "any", type: "image/svg+xml" }] };
}
