import type { NextConfig } from "next";

// Public Supabase values are read through shared workspace packages. Explicitly
// inject them into the browser bundle so a runtime-only environment cannot
// silently produce an unusable sign-in page.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? "";

if (process.env.NODE_ENV === "production" && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the Invoice production build.",
  );
}

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  NEXT_PUBLIC_OPERIX_SUITE_URL: process.env.NEXT_PUBLIC_OPERIX_SUITE_URL ?? "",
  NEXT_PUBLIC_OPERIX_INVOICE_URL: process.env.NEXT_PUBLIC_OPERIX_INVOICE_URL ?? "",
  NEXT_PUBLIC_OPERIX_HR_URL: process.env.NEXT_PUBLIC_OPERIX_HR_URL ?? "",
  NEXT_PUBLIC_OPERIX_BOOKING_URL: process.env.NEXT_PUBLIC_OPERIX_BOOKING_URL ?? "",
  NEXT_PUBLIC_OPERIX_DESK_URL: process.env.NEXT_PUBLIC_OPERIX_DESK_URL ?? "",
  NEXT_PUBLIC_OPERIX_CONTROL_URL: process.env.NEXT_PUBLIC_OPERIX_CONTROL_URL ?? "",
  NEXT_PUBLIC_INVOICE_APP_URL: process.env.NEXT_PUBLIC_INVOICE_APP_URL ?? "",
};

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  env: publicEnv,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "b2b.hidroterm.net",
        pathname: "/products/catalog/**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

