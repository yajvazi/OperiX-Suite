const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabaseUrl = configuredUrl;
export const supabaseKey = configuredKey;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
// Demo mode is intentionally limited to non-production builds so a copied
// preview flag can never disable authentication in a deployed environment.
export const isBookingDemoMode = process.env.NEXT_PUBLIC_BOOKING_DEMO_MODE === "1" && process.env.NODE_ENV !== "production";
