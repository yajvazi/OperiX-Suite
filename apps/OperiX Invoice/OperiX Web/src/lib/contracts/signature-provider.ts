/** Server-only signature provider boundary. Never import this from mobile code. */
export type SigningRequestInput = {
  contractId: string;
  title: string;
  documentBase64: string;
  signers: Array<{ name: string; email: string; order: number; required: boolean }>;
};

export type SigningRequest = { provider: 'documenso'; externalId: string; status: 'sent' | 'draft' };

export interface SignatureProvider {
  createSigningRequest(input: SigningRequestInput): Promise<SigningRequest>;
  cancelSigningRequest(externalId: string): Promise<void>;
}

class DocumensoProvider implements SignatureProvider {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}`, ...(init.headers || {}) },
    });
    if (!response.ok) throw new Error(`Signature provider request failed (${response.status})`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async createSigningRequest(input: SigningRequestInput): Promise<SigningRequest> {
    const data = await this.request('/api/v1/envelopes', { method: 'POST', body: JSON.stringify(input) });
    return { provider: 'documenso', externalId: String(data.id || data.envelopeId), status: 'sent' };
  }

  async cancelSigningRequest(externalId: string) {
    await this.request(`/api/v1/envelopes/${encodeURIComponent(externalId)}/cancel`, { method: 'POST' });
  }
}

export function getSignatureProvider(): SignatureProvider | null {
  const baseUrl = process.env.DOCUMENSO_API_URL;
  const apiKey = process.env.DOCUMENSO_API_KEY;
  return baseUrl && apiKey ? new DocumensoProvider(baseUrl, apiKey) : null;
}
