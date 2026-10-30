import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;
export type PlatformGate = { ok: true; client: Client; email: string } | { ok: false; title: string; body: string };

/**
 * The platform dashboard is for the OperiX owner only. The database decides (platform administrator AND on the
 * allowlist); this only turns its answer into a page. Anyone else sees a plain notice and no data.
 */
export async function gatePlatform(nextPath: string): Promise<PlatformGate> {
  const client = await createClient();
  if (!client) return { ok: false, title: "Platform administration is not configured", body: "The shared authentication client could not be initialized." };
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { data: allowed, error } = await client.rpc("platform_dashboard_access");
  if (error) return { ok: false, title: "Platform dashboard unavailable", body: "The platform dashboard is not installed in this environment." };
  if (allowed !== true) return { ok: false, title: "Internal access required", body: "This area is restricted to the OperiX platform owner." };
  return { ok: true, client, email: user.email || "" };
}

export function PlatformBoundary({ title, body }: { title: string; body: string }) {
  return <main className="boundary-page"><div className="boundary-mark">O</div><p className="boundary-kicker">OPERIX PLATFORM</p><h1>{title}</h1><p>{body}</p></main>;
}
