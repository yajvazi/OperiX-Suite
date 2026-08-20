import type { NextConfig } from "next";

// Next.js embeds NEXT_PUBLIC_* values in the browser bundle at build time.
// Keep the HR app explicit about the browser-safe values so a PM2 runtime
// environment is not mistaken for a client-side build environment.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? "";

if (process.env.NODE_ENV === "production" && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the HR production build.",
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
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@invoice-monorepo/api", "@invoice-monorepo/hr"],
  env: publicEnv,
};

export default nextConfig;
