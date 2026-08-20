export type JsonRecord = Record<string, unknown>;

export interface TwentyCompanyPayload extends JsonRecord {
  id: string;
  name?: string;
  companyName?: string;
  domainName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  operixOrganizationId?: string;
  operixInvoiceCustomerId?: string;
}

export interface TwentyWebhookEnvelope {
  event: string;
  data: JsonRecord;
  timestamp: string;
  organizationId?: string;
}

export interface InvoiceCustomerInput {
  user_id: string;
  company_id: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  tax_id?: string;
}

export interface EntityLinkResult {
  status: "linked" | "processing" | "skipped" | "failed";
  sourceEntityId: string;
  targetEntityId?: string;
  error?: string;
}
