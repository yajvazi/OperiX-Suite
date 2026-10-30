/**
 * Shared helpers for connecting the mobile app to a self-hosted OperiX server.
 * The web app publishes its (public) Supabase address through GET /api/connect;
 * the QR code only carries the web address, never a key or a password.
 */

export const CONNECT_SCHEME = 'operix-invoice://connect';

export type ServerConfig = {
    /** The web app address the user typed or scanned, e.g. https://invoices.example.com */
    webUrl: string;
    supabaseUrl: string;
    supabaseKey: string;
    name: string;
};

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.+\.local$)/i;

/** Accepts "host", "https://host/path" and returns the origin, or null. HTTP is only allowed for local networks. */
export function normalizeServerUrl(input: string): string | null {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try { parsed = new URL(withScheme); } catch { return null; }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && PRIVATE_HOST.test(parsed.hostname))) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.origin;
}

/** Reads a scanned QR value: a deep link, a plain web address, or pasted text. */
export function parseConnectCode(code: string): string | null {
    const value = String(code || '').trim();
    if (value.toLowerCase().startsWith('operix-invoice://')) {
        try {
            const server = new URL(value.replace('operix-invoice://', 'https://operix.invalid/')).searchParams.get('server');
            return server ? normalizeServerUrl(server) : null;
        } catch { return null; }
    }
    return normalizeServerUrl(value);
}

export function buildConnectLink(webUrl: string): string {
    return `${CONNECT_SCHEME}?server=${encodeURIComponent(webUrl.replace(/\/+$/, ''))}`;
}

/** Asks the web server for its public connection settings and validates the answer. */
export async function fetchServerConfig(webUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10000): Promise<ServerConfig> {
    const origin = normalizeServerUrl(webUrl);
    if (!origin) throw new Error('Enter a valid server address, for example https://invoices.example.com');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(`${origin}/api/connect`, { headers: { accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error('This address is not an OperiX server (or it is too old to support mobile connections).');
        const body = await response.json() as Record<string, unknown>;
        const supabaseUrl = normalizeServerUrl(String(body.supabaseUrl || ''));
        const supabaseKey = String(body.supabaseKey || '').trim();
        if (body.app !== 'operix-invoice' || !supabaseUrl || !supabaseKey) throw new Error('This address is not an OperiX server.');
        return { webUrl: origin, supabaseUrl, supabaseKey, name: String(body.name || new URL(origin).hostname).slice(0, 80) };
    } catch (error) {
        if ((error as Error).name === 'AbortError') throw new Error('The server did not answer in time. Check the address and your connection.');
        if (error instanceof TypeError) throw new Error('Could not reach the server. Check the address and your connection.');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
