export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supportStorageBucket = process.env.SUPPORT_STORAGE_BUCKET ?? "operix-support-attachments";

export function requireSupabaseConfiguration(): void {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured for OperiX Support");
}
