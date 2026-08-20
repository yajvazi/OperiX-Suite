import Link from "next/link";
import { LocaleProvider } from "@/lib/i18n";
import { ControlShell } from "@/components/control-shell";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function Boundary({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <main className="boundary-page"><div className="boundary-mark">O</div><p className="boundary-kicker">OPERIX CONTROL</p><h1>{title}</h1><p>{body}</p>{action}</main>;
}

export default async function ControlAppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    return <Boundary title="Connect your OperiX account" body="Add the shared Supabase URL and publishable key to this web app to use OperiX Control." action={<Link className="button button-primary" href="/login">Return to sign in</Link>} />;
  }

  const client = await createClient();
  if (!client) return <Boundary title="Control is not configured" body="The shared authentication client could not be initialized." />;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return <Boundary title="Sign in required" body="Sign in with your existing OperiX account to continue." action={<Link className="button button-primary" href="/login">Sign in</Link>} />;

  const { data: profile } = await client.from("profiles").select("id,active_company_id,company_id").eq("id", user.id).maybeSingle();
  const companyId = profile?.active_company_id || profile?.company_id;
  if (!companyId) return <Boundary title="Choose an organization" body="Your OperiX account does not have an active organization context yet. Open an existing OperiX application to finish setup." />;

  const { data: access, error: accessError } = await client.rpc("control_has_permission", { p_company_id: companyId, p_permission: "control.access" });
  if (accessError) return <Boundary title="Control needs its shared data contract" body="The Control foundation migration is not available in this environment yet. No organization data has been loaded." />;
  if (access !== true) return <Boundary title="Control access is restricted" body="Your current organization membership does not include control.access. Ask an organization owner or administrator for access." />;

  const { data: company } = await client.from("companies").select("default_language").eq("id", companyId).maybeSingle();
  return <LocaleProvider defaultLocale={company?.default_language}><ControlShell>{children}</ControlShell></LocaleProvider>;
}
