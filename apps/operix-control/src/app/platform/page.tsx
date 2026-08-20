import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PlatformOrganizationRow } from "@/lib/control-types";
import { PlatformAdminView } from "@/components/platform-admin-view";

export const dynamic = "force-dynamic";

function Boundary({ title, body }: { title: string; body: string }) {
  return <main className="boundary-page"><div className="boundary-mark">O</div><p className="boundary-kicker">OPERIX PLATFORM</p><h1>{title}</h1><p>{body}</p></main>;
}

export default async function PlatformPage() {
  const client = await createClient();
  if (!client) return <Boundary title="Platform administration is not configured" body="The shared authentication client could not be initialized." />;
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login?next=/platform");
  const { data: isPlatformAdmin, error: accessError } = await client.rpc("control_is_platform_admin");
  if (accessError) return <Boundary title="Platform contract unavailable" body="The internal platform administration contract is not installed in this environment." />;
  if (isPlatformAdmin !== true) return <Boundary title="Internal access required" body="This surface is restricted to the separate OperiX Platform Admin role." />;
  const { data: organizations, error } = await client.rpc("control_list_platform_organizations");
  if (error) return <Boundary title="Platform directory unavailable" body="The organization directory could not be loaded." />;
  return <PlatformAdminView organizations={(organizations || []) as PlatformOrganizationRow[]} />;
}
