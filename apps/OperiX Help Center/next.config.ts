import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; media-src 'self' https:;",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/login", destination: "/en", permanent: true },
      { source: "/dashboard", destination: "/en", permanent: true },
      { source: "/tickets", destination: "/en", permanent: true },
      { source: "/settings", destination: "/en", permanent: true },
      { source: "/agent/:path*", destination: "/en", permanent: true },
    ];
  },
};

export default nextConfig;
