import { NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { companyId?: string; domainId?: string; domain?: string; token?: string };
  if (!body.companyId || !body.domainId || !body.domain || !body.token) return NextResponse.json({ error: "Domain verification details are incomplete." }, { status: 400 });
  try {
    const records = await dns.resolveTxt(body.domain);
    const expected = `operix-control-verification=${body.token}`;
    if (!records.flat().includes(expected)) return NextResponse.json({ error: `Add the TXT record ${expected} before verifying this domain.` }, { status: 422 });
  } catch {
    return NextResponse.json({ error: "The domain does not currently publish a readable TXT record." }, { status: 422 });
  }
  const { data, error } = await client.rpc("control_mark_domain_verified", { p_company_id: body.companyId, p_domain_id: body.domainId, p_token: body.token });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ domain: data });
}
