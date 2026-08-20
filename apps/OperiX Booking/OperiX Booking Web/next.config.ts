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
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the Booking production build.",
  );
}

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  NEXT_PUBLIC_BOOKING_DEMO_MODE: process.env.NEXT_PUBLIC_BOOKING_DEMO_MODE ?? "0",
  NEXT_PUBLIC_OPERIX_CONTROL_URL: process.env.NEXT_PUBLIC_OPERIX_CONTROL_URL ?? "",
  NEXT_PUBLIC_SUITE_APP_URL: process.env.NEXT_PUBLIC_SUITE_APP_URL ?? "",
  NEXT_PUBLIC_INVOICE_APP_URL: process.env.NEXT_PUBLIC_INVOICE_APP_URL ?? "",
  NEXT_PUBLIC_HR_APP_URL: process.env.NEXT_PUBLIC_HR_APP_URL ?? "",
  NEXT_PUBLIC_BOOKING_APP_URL: process.env.NEXT_PUBLIC_BOOKING_APP_URL ?? "",
  NEXT_PUBLIC_DESK_APP_URL: process.env.NEXT_PUBLIC_DESK_APP_URL ?? "",
};

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  env: publicEnv,
  transpilePackages: ["@invoice-monorepo/api", "@invoice-monorepo/booking"],
  experimental: { optimizePackageImports: ["lucide-react"] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
