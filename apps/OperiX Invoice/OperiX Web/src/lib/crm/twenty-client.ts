import { getCrmUrl } from "./config";
import type { JsonRecord } from "./types";

export class TwentyApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly retriable: boolean) {
    super(message);
    this.name = "TwentyApiError";
  }
}

export class TwentyClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async updateCompany(companyId: string, fields: JsonRecord): Promise<JsonRecord> {
    return this.request(`/rest/companies/${encodeURIComponent(companyId)}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }

  private async request(path: string, init: RequestInit): Promise<JsonRecord> {
    const response = await this.fetcher(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status;
      throw new TwentyApiError(status, `Twenty API request failed with ${status}.`, status === 408 || status === 429 || status >= 500);
    }
    return payload as JsonRecord;
  }
}

export function createTwentyClient(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): TwentyClient | null {
  const apiKey = env.OPERIX_TWENTY_API_KEY?.trim();
  if (!apiKey) return null;
  return new TwentyClient(getCrmUrl(env), apiKey, fetcher);
}

export function twentyLinkFieldName(env: Record<string, string | undefined> = process.env): string {
  const field = env.OPERIX_TWENTY_INVOICE_CUSTOMER_FIELD?.trim() || "operixInvoiceCustomerId";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) throw new Error("Invalid Twenty link field name.");
  return field;
}
