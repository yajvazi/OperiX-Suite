export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const appEnvironment = process.env.NEXT_PUBLIC_OPERIX_ENVIRONMENT?.trim() || "development";

export const appUrls = {
  suite: process.env.NEXT_PUBLIC_OPERIX_SUITE_URL || "https://suite.operixsuite.com",
  invoice: process.env.NEXT_PUBLIC_OPERIX_INVOICE_URL || "https://invoice.operixsuite.com",
  hr: process.env.NEXT_PUBLIC_OPERIX_HR_URL || "https://hr.operixsuite.com",
  booking: process.env.NEXT_PUBLIC_OPERIX_BOOKING_URL || "https://booking.operixsuite.com",
  desk: process.env.NEXT_PUBLIC_OPERIX_DESK_URL || "https://desk.operixsuite.com",
  support: process.env.NEXT_PUBLIC_OPERIX_SUPPORT_URL || "https://support.operixsuite.com",
  crm: process.env.NEXT_PUBLIC_OPERIX_CRM_URL || "https://crm.operixsuite.com",
};
