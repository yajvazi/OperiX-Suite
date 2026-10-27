import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ operationId: z.string().uuid() });

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Invitation acceptance is unavailable." }, { status: 503 });
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Sign in through the invitation link before accepting it." }, { status: 401 });
  try {
    const { operationId } = bodySchema.parse(await request.json());
    const { data, error } = await client.rpc("rbac_accept_user_access_invitation", { p_operation_id: operationId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
    return NextResponse.json({ result: data }, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    if (caught instanceof z.ZodError) return NextResponse.json({ error: "The invitation link is invalid." }, { status: 400 });
    return NextResponse.json({ error: "The invitation could not be accepted." }, { status: 500 });
  }
}
