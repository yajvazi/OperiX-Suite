import { describe, expect, it } from 'vitest';
import { buildConnectLink, fetchServerConfig, normalizeServerUrl, parseConnectCode } from './server-connect';

const okFetch = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('server connect', () => {
    it('normalizes addresses and refuses insecure public hosts', () => {
        expect(normalizeServerUrl('invoices.example.com/')).toBe('https://invoices.example.com');
        expect(normalizeServerUrl('http://192.168.1.5:3000')).toBe('http://192.168.1.5:3000');
        expect(normalizeServerUrl('http://example.com')).toBeNull();
        expect(normalizeServerUrl('javascript:alert(1)')).toBeNull();
        expect(normalizeServerUrl('https://user:pw@example.com')).toBeNull();
        expect(normalizeServerUrl('')).toBeNull();
    });
    it('round-trips the QR link', () => {
        const link = buildConnectLink('https://invoices.example.com/');
        expect(parseConnectCode(link)).toBe('https://invoices.example.com');
        expect(parseConnectCode('https://invoices.example.com')).toBe('https://invoices.example.com');
        expect(parseConnectCode('operix-invoice://connect?server=http%3A%2F%2Fexample.com')).toBeNull();
    });
    it('validates the server answer', async () => {
        const good = { app: 'operix-invoice', supabaseUrl: 'https://db.example.com', supabaseKey: 'k', name: 'Acme' };
        await expect(fetchServerConfig('https://a.example.com', okFetch(good))).resolves.toMatchObject({ webUrl: 'https://a.example.com', supabaseUrl: 'https://db.example.com', name: 'Acme' });
        await expect(fetchServerConfig('https://a.example.com', okFetch({ ...good, app: 'other' }))).rejects.toThrow('not an OperiX');
        await expect(fetchServerConfig('https://a.example.com', okFetch({}, false))).rejects.toThrow('not an OperiX');
        await expect(fetchServerConfig('nope://', okFetch(good))).rejects.toThrow('valid server address');
    });
});
