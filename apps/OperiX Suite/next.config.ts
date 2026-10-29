import type { NextConfig } from "next";

// Pages from the previous site map to their closest new page so existing links keep working.
const gone = ["/about", "/features", "/resources", "/enterprise", "/demo", "/book-demo", "/book-demo/success", "/solutions/:path*", "/products/hr", "/products/desk", "/products/control"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  async redirects() {
    return [
      { source: "/products/invoice", destination: "/invoice", permanent: true },
      { source: "/products/booking", destination: "/booking", permanent: true },
      { source: "/products/suite", destination: "/pricing", permanent: true },
      { source: "/al", destination: "/sq", permanent: true },
      { source: "/al/:path*", destination: "/sq/:path*", permanent: true },
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
      ...gone.map((source) => ({ source, destination: "/", permanent: true })),
    ];
  },
};

export default nextConfig;
