import type { NextConfig } from "next";

// Next.js does not reliably inline public environment lookups from this
// workspace package when they are read through `process.env` in a shared
// library. Explicitly expose only browser-safe values at build time. The
// publishable/anon key is intended for the browser; service-role credentials
// must never be placed here.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? "";

if (process.env.NODE_ENV === "production" && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the Control production build.",
  );
}

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  NEXT_PUBLIC_OPERIX_ENVIRONMENT: process.env.NEXT_PUBLIC_OPERIX_ENVIRONMENT ?? "development",
  NEXT_PUBLIC_OPERIX_SUITE_URL: process.env.NEXT_PUBLIC_OPERIX_SUITE_URL ?? "",
  NEXT_PUBLIC_OPERIX_INVOICE_URL: process.env.NEXT_PUBLIC_OPERIX_INVOICE_URL ?? "",
  NEXT_PUBLIC_OPERIX_HR_URL: process.env.NEXT_PUBLIC_OPERIX_HR_URL ?? "",
  NEXT_PUBLIC_OPERIX_BOOKING_URL: process.env.NEXT_PUBLIC_OPERIX_BOOKING_URL ?? "",
  NEXT_PUBLIC_OPERIX_DESK_URL: process.env.NEXT_PUBLIC_OPERIX_DESK_URL ?? "",
  NEXT_PUBLIC_OPERIX_SUPPORT_URL: process.env.NEXT_PUBLIC_OPERIX_SUPPORT_URL ?? "",
  NEXT_PUBLIC_OPERIX_CRM_URL: process.env.NEXT_PUBLIC_OPERIX_CRM_URL ?? "",
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: publicEnv,
};

export default nextConfig;
