import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingError, previewInvoiceUserAccessOperation, settleInvoiceUserAccessOperation } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const roleSchema = z.enum(["company_administrator", "manager", "employee", "admin"]);
const permissionsSchema = z.record(z.string(), z.boolean()).default({});
const scopesSchema = z.record(z.string(), z.enum(["OWN", "ASSIGNED", "ALL"])).default({});
const bodySchema = z.object({
  action: z.enum(["preview_invite", "invite", "update", "suspend", "reactivate", "remove", "resend"]),
  companyId: z.string().uuid().optional(),
  operationId: z.string().uuid().optional(),
  operationKey: z.string().min(16).max(200).optional(),
  membershipId: z.string().uuid().optional(),
  email: z.string().email().max(320).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  roleCode: roleSchema.optional(),
  permissions: permissionsSchema,
  scopes: scopesSchema,
});

function publicSummary(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const safe = { ...(value as Record<string, unknown>) };
  delete safe.stripe_subscription_id;
  delete safe.stripe_customer_id;
  return safe;
}

function publicOperation(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const safe = { ...(value as Record<string, unknown>) };
  delete safe.stripe_subscription_id;
  delete safe.stripe_invoice_id;
  delete safe.stripe_customer_id;
  delete safe.root_company_id;
  delete safe.created_by;
  if (safe.billing_preview && typeof safe.billing_preview === "object") {
    const preview = { ...(safe.billing_preview as Record<string, unknown>) };
    delete preview.invoice_id;
    safe.billing_preview = preview;
  }
  return safe;
}

function publicBillingPreview(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const safe = { ...(value as Record<string, unknown>) };
  delete safe.invoiceId;
  delete safe.invoice_id;
  return safe;
}

function errorResponse(caught: unknown, fallback: string) {
  if (caught instanceof z.ZodError) return NextResponse.json({ error: "The Users & Access request is invalid." }, { status: 400 });
  if (caught instanceof BillingError) return NextResponse.json({ error: caught.message }, { status: caught.status });
  console.error(fallback, caught instanceof Error ? caught.message : "unknown error");
  return NextResponse.json({ error: fallback }, { status: 500 });
}

async function authenticatedClient() {
  const client = await createClient();
  if (!client) throw new BillingError("Users & Access is not configured.", 503);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new BillingError("Authentication is required.", 401);
  return { client, user };
}

function inviteRedirectUrl(request: Request, operationId: string) {
  const configured = process.env.BILLING_APP_URL?.trim() || process.env.NEXT_PUBLIC_OPERIX_APP_URL?.trim();
  const origin = new URL(configured || request.url).origin;
  const next = `/auth/invite?operation=${encodeURIComponent(operationId)}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

type AuthenticatedSupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

async function startOperation(client: AuthenticatedSupabaseClient, body: z.infer<typeof bodySchema>, operationType: "invite" | "remove") {
  if (!client || !body.companyId || !body.operationKey) throw new BillingError("A company and idempotency key are required.", 400);
  const { data, error } = await client.rpc("rbac_begin_user_access_operation", {
    p_company_id: body.companyId,
    p_operation_key: body.operationKey,
    p_operation_type: operationType,
    p_membership_id: body.membershipId || null,
    p_email: body.email?.trim().toLowerCase() || null,
    p_first_name: body.firstName?.trim() || null,
    p_last_name: body.lastName?.trim() || null,
    p_role_code: body.roleCode || "employee",
    p_permissions: body.permissions,
    p_scopes: body.scopes,
  });
  if (error) throw new BillingError(error.message, error.code === "42501" ? 403 : 400);
  return (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
}

async function findAuthUserByEmail(admin: NonNullable<ReturnType<typeof createAdminClient>>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  // Supabase Auth exposes a paginated admin list rather than a get-by-email
  // method. Keep the lookup server-side and bounded so an existing OperiX
  // account is reused without ever creating a duplicate auth identity.
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (listed.error) throw new BillingError("The existing OperiX account could not be checked.", 502);
    const match = listed.data.users.find((candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail);
    if (match) return match;
    if (listed.data.users.length < 100 || listed.data.lastPage === page) return null;
  }
  throw new BillingError("The existing OperiX account could not be checked safely. Try again later.", 503);
}

async function inviteOrReuseAccount(request: Request, operationId: string, email: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server invitation storage is not configured.", 503);
  const existingUser = await findAuthUserByEmail(admin, email);
  if (existingUser) {
    const confirmed = Boolean(existingUser.email_confirmed_at || existingUser.confirmed_at);
    if (confirmed) return { userId: existingUser.id, delivery: "existing_account" as const };
    throw new BillingError("An invitation for this email is already pending. Use Resend invitation after checking the Auth email delivery configuration.", 409);
  }
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    data: { operix_invitation_operation_id: operationId },
    redirectTo: inviteRedirectUrl(request, operationId),
  });
  if (invited.error || !invited.data.user) throw new BillingError("The invitation email could not be sent. The paid seat remains pending and can be retried safely.", 502);
  return { userId: invited.data.user.id, delivery: "auth_invitation" as const };
}

async function readInvitationOperation(client: AuthenticatedSupabaseClient, operationId: string) {
  const { data, error } = await client.rpc("rbac_get_user_access_operation", { p_operation_id: operationId });
  if (error) throw new BillingError(error.message, error.code === "42501" ? 403 : 400);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new BillingError("The invitation operation could not be found.", 404);
  return row as Record<string, unknown>;
}

async function readServerUserAccessOperation(operationId: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server invitation storage is not configured.", 503);
  const { data, error } = await admin.from("user_access_operations").select("*").eq("id", operationId).maybeSingle();
  if (error || !data) throw new BillingError("The invitation operation could not be found.", 404);
  return data as Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    const { client, user } = await authenticatedClient();
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId) throw new BillingError("A company is required.", 400);
    const [membersResult, catalogResult, summaryResult] = await Promise.all([
      client.rpc("rbac_list_users_access", { p_company_id: companyId }),
      client.rpc("rbac_list_permission_catalog"),
      client.rpc("rbac_get_users_access_billing_summary", { p_company_id: companyId }),
    ]);
    if (membersResult.error || catalogResult.error || summaryResult.error) {
      const error = membersResult.error || catalogResult.error || summaryResult.error;
      throw new BillingError(error?.message || "Users & Access could not be loaded.", error?.code === "42501" ? 403 : 502);
    }
    return NextResponse.json({
      companyId,
      actorUserId: user.id,
      members: membersResult.data || [],
      permissions: catalogResult.data || [],
      billing: publicSummary(Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (caught) {
    return errorResponse(caught, "Users & Access could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const { client } = await authenticatedClient();
    const body = bodySchema.parse(await request.json());

    if (body.action === "preview_invite" || body.action === "invite") {
      const operation = await startOperation(client, body, "invite");
      const operationId = String(operation.operation_id || "");
      if (!operationId) throw new BillingError("The invitation operation is incomplete.", 502);
      if (body.action === "preview_invite") {
        const preview = await previewInvoiceUserAccessOperation(operationId);
        return NextResponse.json({ operation, billing: publicSummary(operation.summary), stripePreview: publicBillingPreview(preview) }, { headers: { "cache-control": "no-store" } });
      }
      if (!body.email) throw new BillingError("The invitation operation is incomplete.", 502);
      const settlement = await settleInvoiceUserAccessOperation(operationId);
      if (settlement.operation.status === "invite_pending" && settlement.operation.target_user_id) {
        return NextResponse.json({ operation: publicOperation(settlement.operation), delivery: "already_pending", billing: publicBillingPreview(settlement.preview) }, { headers: { "cache-control": "no-store" } });
      }
      const account = await inviteOrReuseAccount(request, operationId, body.email.trim().toLowerCase());
      const admin = createAdminClient();
      if (!admin) throw new BillingError("Server invitation storage is not configured.", 503);
      const finalized = await admin.rpc("rbac_finalize_user_access_invite", { p_operation_id: operationId, p_user_id: account.userId });
      if (finalized.error) throw new BillingError(finalized.error.message, finalized.error.code === "42501" ? 403 : 502);
      if (account.delivery === "existing_account") {
        const activated = await admin.rpc("rbac_activate_existing_user_access", { p_operation_id: operationId, p_user_id: account.userId });
        if (activated.error) throw new BillingError(activated.error.message, activated.error.code === "42501" ? 403 : 502);
        return NextResponse.json({ operation: activated.data, delivery: account.delivery, billing: publicBillingPreview(settlement.preview) }, { headers: { "cache-control": "no-store" } });
      }
      return NextResponse.json({ operation: publicOperation(finalized.data), delivery: account.delivery, billing: publicBillingPreview(settlement.preview) }, { headers: { "cache-control": "no-store" } });
    }

    if (body.action === "update") {
      if (!body.membershipId || !body.roleCode) throw new BillingError("A membership and role are required.", 400);
      if (!body.companyId) throw new BillingError("A company is required.", 400);
      const { data, error } = await client.rpc("rbac_update_user_access", {
        p_membership_id: body.membershipId,
        p_role_code: body.roleCode,
        p_permissions: body.permissions,
        p_scopes: body.scopes,
        p_first_name: body.firstName || null,
        p_last_name: body.lastName || null,
      });
      if (error) throw new BillingError(error.message, error.code === "42501" ? 403 : 400);
      return NextResponse.json({ result: data }, { headers: { "cache-control": "no-store" } });
    }

    if (body.action === "suspend" || body.action === "reactivate") {
      if (!body.membershipId) throw new BillingError("A membership is required.", 400);
      const { data, error } = await client.rpc("rbac_set_user_access_status", { p_membership_id: body.membershipId, p_status: body.action === "suspend" ? "suspended" : "active" });
      if (error) throw new BillingError(error.message, error.code === "42501" ? 403 : 400);
      return NextResponse.json({ result: data }, { headers: { "cache-control": "no-store" } });
    }

    if (body.action === "remove") {
      const operation = await startOperation(client, body, "remove");
      const operationId = String(operation.operation_id || "");
      if (!operationId) throw new BillingError("The removal operation is incomplete.", 502);
      const settlement = await settleInvoiceUserAccessOperation(operationId);
      const admin = createAdminClient();
      if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
      const finalized = await admin.rpc("rbac_finalize_user_access_removal", { p_operation_id: operationId });
      if (finalized.error) throw new BillingError(finalized.error.message, finalized.error.code === "42501" ? 403 : 502);
      return NextResponse.json({ operation: publicOperation(finalized.data), billing: publicBillingPreview(settlement.preview) }, { headers: { "cache-control": "no-store" } });
    }

    if (body.action === "resend") {
      if (!body.operationId) throw new BillingError("An invitation operation is required.", 400);
      let operation = await readInvitationOperation(client, body.operationId);
      if (operation.operation_type !== "invite" || !["pending_billing", "failed", "billing_succeeded", "invite_pending"].includes(String(operation.status))) {
        throw new BillingError("This invitation is not available for resend.", 409);
      }
      if (["pending_billing", "failed"].includes(String(operation.status))) {
        const serverOperation = await readServerUserAccessOperation(body.operationId);
        const retried = await startOperation(client, {
          ...body,
          action: "invite",
          companyId: String(serverOperation.company_id),
          operationKey: String(serverOperation.operation_key),
          membershipId: undefined,
          email: String(serverOperation.email || ""),
          firstName: String(serverOperation.first_name || ""),
          lastName: String(serverOperation.last_name || ""),
          roleCode: String(serverOperation.requested_role_code || "employee") as z.infer<typeof roleSchema>,
          permissions: (serverOperation.requested_permissions || {}) as Record<string, boolean>,
          scopes: (serverOperation.requested_scopes || {}) as Record<string, "OWN" | "ASSIGNED" | "ALL">,
        }, "invite");
        const retriedOperationId = String(retried.operation_id || "");
        if (retriedOperationId !== body.operationId) throw new BillingError("The invitation retry could not be verified safely.", 409);
        await settleInvoiceUserAccessOperation(retriedOperationId);
        operation = await readInvitationOperation(client, body.operationId);
      }
      if (!["billing_succeeded", "invite_pending"].includes(String(operation.status))) {
        throw new BillingError("The invitation billing operation is still pending. Try again shortly.", 409);
      }
      const email = String(operation.email || "").trim().toLowerCase();
      if (!email) throw new BillingError("The invitation email is missing.", 409);
      const account = await inviteOrReuseAccount(request, body.operationId, email);
      const admin = createAdminClient();
      if (!admin) throw new BillingError("Server invitation storage is not configured.", 503);
      const finalized = await admin.rpc("rbac_finalize_user_access_invite", { p_operation_id: body.operationId, p_user_id: account.userId });
      if (finalized.error) throw new BillingError(finalized.error.message, finalized.error.code === "42501" ? 403 : 502);
      if (account.delivery === "existing_account") {
        const activated = await admin.rpc("rbac_activate_existing_user_access", { p_operation_id: body.operationId, p_user_id: account.userId });
        if (activated.error) throw new BillingError(activated.error.message, activated.error.code === "42501" ? 403 : 502);
        return NextResponse.json({ operation: activated.data, delivery: account.delivery }, { headers: { "cache-control": "no-store" } });
      }
      return NextResponse.json({ operation: publicOperation(finalized.data), delivery: account.delivery }, { headers: { "cache-control": "no-store" } });
    }
    throw new BillingError("The Users & Access operation is not supported.", 400);
  } catch (caught) {
    return errorResponse(caught, "The Users & Access operation could not be completed.");
  }
}
