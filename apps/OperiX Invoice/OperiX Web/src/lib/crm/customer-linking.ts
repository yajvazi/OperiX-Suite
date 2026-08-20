import type { SupabaseClient } from "@supabase/supabase-js";
import { claimSourceLink, updateLink } from "./entity-links";
import type { EntityLinkResult, InvoiceCustomerInput, TwentyCompanyPayload } from "./types";

export function invoiceCustomerInput(company: TwentyCompanyPayload, userId: string, organizationId: string): InvoiceCustomerInput {
  const name = String(company.name || company.companyName || company.domainName || "").trim();
  if (!name) throw new Error("Twenty company name is required to link an Invoice customer.");
  return {
    user_id: userId,
    company_id: organizationId,
    name,
    email: optionalText(company.email),
    phone: optionalText(company.phone),
    website: optionalText(company.website),
    address: optionalText(company.address),
    city: optionalText(company.city),
    country: optionalText(company.country),
    tax_id: optionalText(company.taxId),
  };
}

export function ownedCustomerFields() {
  return {
    crm: ["name", "domainName", "crmOwner", "relationshipStatus"],
    invoice: ["tax_id", "billingAddress", "billingStatus", "paymentTerms"],
    shared: ["name", "email", "phone", "website", "city", "country"],
  } as const;
}

export async function linkTwentyCompanyToInvoiceCustomer({
  db,
  organizationId,
  company,
  allowCreate,
}: {
  db: SupabaseClient;
  organizationId: string;
  company: TwentyCompanyPayload;
  allowCreate: boolean;
}): Promise<EntityLinkResult> {
  const sourceEntityId = String(company.id);
  const claim = await claimSourceLink(db, {
    organizationId,
    sourceSystem: "twenty",
    sourceEntityType: "company",
    sourceEntityId,
    targetSystem: "operix_invoice",
    targetEntityType: "client",
  });
  if (!claim.owner) {
    if (claim.existing?.targetEntityId || claim.existing?.status === "failed" || claim.existing?.status === "skipped") return claim.existing;
    return { status: "processing", sourceEntityId, targetEntityId: claim.existing?.targetEntityId };
  }

  const invoiceCustomerId = optionalText(company.operixInvoiceCustomerId);
  if (invoiceCustomerId) {
    const { data: existingCustomer, error: customerError } = await db
      .from("clients")
      .select("id")
      .eq("id", invoiceCustomerId)
      .eq("company_id", organizationId)
      .maybeSingle();
    if (customerError || !existingCustomer) {
      const error = customerError?.message || "Invoice customer is not in the requested organization.";
      await updateLink(db, String(claim.id), { status: "failed", error });
      return { status: "failed", sourceEntityId, error };
    }
    await updateLink(db, String(claim.id), { status: "linked", targetEntityId: String(existingCustomer.id) });
    return { status: "linked", sourceEntityId, targetEntityId: String(existingCustomer.id) };
  }

  if (!allowCreate) {
    await updateLink(db, String(claim.id), { status: "skipped", error: "Customer creation is disabled by feature flag." });
    return { status: "skipped", sourceEntityId, error: "Customer creation is disabled by feature flag." };
  }

  const { data: membership, error: membershipError } = await db
    .from("memberships")
    .select("user_id,role")
    .eq("company_id", organizationId)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership?.user_id) {
    const error = membershipError?.message || "No owner or administrator is available for this organization.";
    await updateLink(db, String(claim.id), { status: "failed", error });
    return { status: "failed", sourceEntityId, error };
  }

  const input = invoiceCustomerInput(company, String(membership.user_id), organizationId);
  const { data: createdCustomer, error: createError } = await db
    .from("clients")
    .insert(input)
    .select("id")
    .single();
  if (createError || !createdCustomer) {
    const error = createError?.message || "Invoice customer could not be created.";
    await updateLink(db, String(claim.id), { status: "failed", error });
    return { status: "failed", sourceEntityId, error };
  }

  await updateLink(db, String(claim.id), {
    status: "linked",
    targetEntityId: String(createdCustomer.id),
    metadata: { fieldOwnership: ownedCustomerFields() },
  });
  return { status: "linked", sourceEntityId, targetEntityId: String(createdCustomer.id) };
}

function optionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}
