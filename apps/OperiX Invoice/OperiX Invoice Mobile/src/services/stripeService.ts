/**
 * Client-side Stripe integration facade.
 *
 * Stripe API calls and credentials stay in Supabase Edge Functions. The
 * mobile app only starts OAuth, requests a server-side sync, and reads the
 * tenant-scoped records imported by that sync.
 */

import * as WebBrowser from 'expo-web-browser';
import { supabase, supabaseUrl } from '@invoice-monorepo/api';
import { notifyBusinessEvent } from './pushNotifications';

// Keep the function endpoint on the same Supabase project as the app session.
// A separate URL is supported for deployments where Edge Functions are hosted
// on a dedicated Supabase project, but it must be configured explicitly along
// with the matching public key. Falling back to a hard-coded project here
// creates a valid-looking request with a JWT that the function cannot verify.
const configuredStripeSupabaseUrl = process.env.EXPO_PUBLIC_STRIPE_SUPABASE_URL?.trim();
const stripeFunctionsBaseUrl = (configuredStripeSupabaseUrl || supabaseUrl)
    .replace(/\/+$/, '')
    .replace(/\/functions\/v1$/, '');
const stripeFunctionsApiKey = (
    process.env.EXPO_PUBLIC_STRIPE_SUPABASE_PUBLISHABLE_KEY
    || process.env.EXPO_PUBLIC_STRIPE_SUPABASE_ANON_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || ''
).trim();

export interface StripeStore {
    id: string;
    company_id: string;
    branch_id?: string | null;
    store_name: string;
    stripe_account_id?: string | null;
    account_email?: string | null;
    livemode: boolean;
    status: 'pending' | 'connected' | 'disconnected' | 'error' | string;
    auto_sync: boolean;
    auto_invoice_sales: boolean;
    connected_at?: string | null;
    last_synced_at?: string | null;
    last_error?: string | null;
}

export interface StripeTransaction {
    id: string;
    stripe_id: string;
    stripe_store_id?: string | null;
    type: string;
    amount: number;
    currency: string;
    description?: string | null;
    created_at: string;
    status?: string | null;
    customer_email?: string | null;
    customer_name?: string | null;
    fee?: number | null;
    net?: number | null;
    invoice_id?: string | null;
    client_id?: string | null;
    store_name?: string | null;
    payment_details?: any;
}

export interface StripePayout {
    id: string;
    stripe_id: string;
    stripe_store_id?: string | null;
    amount: number;
    currency: string;
    arrival_date: string;
    status: string;
    method?: string | null;
    description?: string | null;
}

export interface StripeBalance {
    stripe_store_id: string;
    company_id: string;
    currency: string;
    available_balance: number;
    pending_balance: number;
    as_of: string;
}

export interface StripeOnlineInvoice {
    id: string;
    invoice_number: string;
    company_id?: string | null;
    stripe_store_id?: string | null;
    client_id?: string | null;
    total_amount: number;
    currency: string;
    issue_date: string;
    status: string;
    payment_status?: string | null;
    client_name?: string | null;
    store_name?: string | null;
}

export interface StripeSyncResult {
    storeId?: string;
    transactionsCount: number;
    payoutsCount: number;
    invoicesCreated: number;
    totalSales: number;
    totalPayouts: number;
    totalFees: number;
    balances?: Array<{ currency: string; available: number; pending: number }>;
    truncated?: boolean;
    warnings?: string[];
}

async function sessionToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return session.access_token;
}

function responseMessage(payload: unknown, fallback: string) {
    if (typeof payload === 'string' && payload.trim()) return payload.trim();
    if (!payload || typeof payload !== 'object') return fallback;

    const record = payload as { error?: unknown; message?: unknown };
    if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
    if (record.error && typeof record.error === 'object' && 'message' in record.error) {
        const nestedMessage = (record.error as { message?: unknown }).message;
        if (typeof nestedMessage === 'string' && nestedMessage.trim()) return nestedMessage.trim();
    }
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    return fallback;
}

async function callFunction<T>(name: string, body: Record<string, unknown> = {}) {
    const token = await sessionToken();
    const response = await fetch(`${stripeFunctionsBaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            ...(stripeFunctionsApiKey ? { apikey: stripeFunctionsApiKey } : {}),
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    const rawBody = await response.text();
    let data: unknown = {};
    if (rawBody.trim()) {
        try {
            data = JSON.parse(rawBody);
        } catch (_) {
            data = rawBody;
        }
    }
    if (!response.ok) {
        const error = new Error(responseMessage(data, `${name} failed`));
        Object.assign(error, { status: response.status });
        throw error;
    }
    if (typeof data !== 'object' || data === null) {
        throw new Error(`${name} returned an invalid response`);
    }
    return data as T;
}

class StripeService {
    async initiateOAuth(
        _userId: string,
        options: { companyId?: string; storeId?: string; storeName?: string } = {},
    ): Promise<{ success: boolean; error?: string; storeId?: string; accountId?: string }> {
        try {
            const start = await callFunction<{ url: string; store_id: string }>('stripe-start', {
                company_id: options.companyId,
                store_id: options.storeId,
                store_name: options.storeName,
            });
            if (!start.url) throw new Error('Stripe connection did not return an authorization URL');
            const result = await WebBrowser.openAuthSessionAsync(start.url, 'operix-invoice://stripe-callback');
            if (result.type === 'success' && result.url) {
                const callback = new URL(result.url);
                const success = callback.searchParams.get('success') === 'true';
                return {
                    success,
                    storeId: callback.searchParams.get('store_id') || start.store_id,
                    accountId: callback.searchParams.get('account_id') || undefined,
                    error: success ? undefined : callback.searchParams.get('error') || 'Stripe authorization failed',
                };
            }
            return { success: false, error: result.type === 'cancel' ? 'User cancelled authorization' : 'OAuth flow failed' };
        } catch (error: any) {
            return { success: false, error: error?.message || 'Could not connect Stripe' };
        }
    }

    async listStores(companyIds?: string | string[]): Promise<StripeStore[]> {
        const ids = Array.isArray(companyIds) ? companyIds : companyIds ? [companyIds] : [];
        let query = supabase.from('stripe_stores').select('*').order('created_at', { ascending: true });
        if (ids.length === 1) query = query.eq('company_id', ids[0]);
        if (ids.length > 1) query = query.in('company_id', ids);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as StripeStore[];
    }

    async checkConnectionStatus(userId: string, companyIds?: string | string[]): Promise<{
        connected: boolean;
        method?: 'oauth';
        accountId?: string;
        livemode?: boolean;
        connectedAt?: string;
        stores: StripeStore[];
    }> {
        try {
            const stores = await this.listStores(companyIds);
            const connected = stores.find((store) => store.status === 'connected');
            return {
                connected: Boolean(connected),
                method: connected ? 'oauth' : undefined,
                accountId: connected?.stripe_account_id || undefined,
                livemode: connected?.livemode,
                connectedAt: connected?.connected_at || undefined,
                stores,
            };
        } catch (_) {
            // Keep the old argument in the API for callers while avoiding any
            // profile credential read on the client.
            void userId;
            return { connected: false, stores: [] };
        }
    }

    async disconnect(_userId: string, storeId?: string): Promise<boolean> {
        try {
            await callFunction('stripe-disconnect', { store_id: storeId });
            return true;
        } catch (_) {
            return false;
        }
    }

    async syncViaEdgeFunction(storeId?: string, force = false): Promise<StripeSyncResult> {
        try {
            return await callFunction<StripeSyncResult>('stripe-sync', { store_id: storeId, force });
        } catch (error) {
            if (storeId) {
                const { data: store } = await supabase.from('stripe_stores').select('company_id').eq('id', storeId).maybeSingle();
                if (store?.company_id) {
                    void notifyBusinessEvent('sync_failed', String(store.company_id), storeId, {
                        message: error instanceof Error ? error.message : 'Stripe synchronization failed.',
                    }).catch((notificationError) => console.warn('Sync failure notification could not be sent:', notificationError));
                }
            }
            throw error;
        }
    }

    async updateStoreSettings(storeId: string, settings: { autoSync?: boolean; autoInvoiceSales?: boolean }) {
        return callFunction('stripe-settings', {
            store_id: storeId,
            auto_sync: settings.autoSync,
            auto_invoice_sales: settings.autoInvoiceSales,
        });
    }

    async getDashboardSummary(_userId: string, companyIds?: string | string[]): Promise<{
        totalSales: number;
        totalPayouts: number;
        totalFees: number;
        totalNet: number;
        pendingPayouts: number;
        recentTransactions: StripeTransaction[];
        recentPayouts: StripePayout[];
        stores: StripeStore[];
        balances: StripeBalance[];
        onlineInvoices: StripeOnlineInvoice[];
    }> {
        const ids = Array.isArray(companyIds) ? companyIds : companyIds ? [companyIds] : [];
        const stores = await this.listStores(ids);

        let transactionsQuery = supabase.from('stripe_transactions').select('*').order('created_at', { ascending: false });
        let payoutsQuery = supabase.from('stripe_payouts').select('*').order('created_at', { ascending: false });
        let balancesQuery = supabase.from('stripe_balance_snapshots').select('*').order('as_of', { ascending: false });
        let invoicesQuery = supabase
                .from('invoices')
            .select('id,invoice_number,company_id,stripe_store_id,client_id,total_amount,currency,issue_date,status,payment_status')
            .eq('source_document_type', 'stripe_transaction')
            .order('issue_date', { ascending: false });
        if (ids.length === 1) {
            transactionsQuery = transactionsQuery.eq('company_id', ids[0]);
            payoutsQuery = payoutsQuery.eq('company_id', ids[0]);
            balancesQuery = balancesQuery.eq('company_id', ids[0]);
            invoicesQuery = invoicesQuery.eq('company_id', ids[0]);
        } else if (ids.length > 1) {
            transactionsQuery = transactionsQuery.in('company_id', ids);
            payoutsQuery = payoutsQuery.in('company_id', ids);
            balancesQuery = balancesQuery.in('company_id', ids);
            invoicesQuery = invoicesQuery.in('company_id', ids);
        }
        const [{ data: transactionRows }, { data: payoutRows }, { data: balanceRows }, { data: invoiceRows }] = await Promise.all([
            transactionsQuery,
            payoutsQuery,
            balancesQuery,
            invoicesQuery,
        ]);
        const transactions = (transactionRows || []) as StripeTransaction[];
        const payouts = (payoutRows || []) as StripePayout[];
        const totalSales = transactions
            .filter((row) => row.type === 'charge' || row.type === 'payment')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const totalFees = transactions.reduce((sum, row) => sum + Number(row.fee || 0), 0);
        const totalNet = transactions.reduce((sum, row) => sum + Number(row.net || 0), 0);
        const totalPayouts = payouts.filter((row) => row.status === 'paid').reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const pendingPayouts = payouts
            .filter((row) => row.status === 'pending' || row.status === 'in_transit')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);

        const invoiceRowsWithClients = (invoiceRows || []) as StripeOnlineInvoice[];
        const clientIds = [...new Set(invoiceRowsWithClients.map((invoice) => invoice.client_id).filter(Boolean))] as string[];
        let clientsById = new Map<string, string>();
        if (clientIds.length) {
            const { data: clients } = await supabase.from('clients').select('id,name,email').in('id', clientIds);
            clientsById = new Map((clients || []).map((client) => [client.id, client.name || client.email || 'Stripe customer']));
        }

        return {
            totalSales,
            totalPayouts,
            totalFees,
            totalNet,
            pendingPayouts,
            recentTransactions: transactions.slice(0, 20).map((transaction) => ({
                ...transaction,
                store_name: transaction.stripe_store_id ? stores.find((store) => store.id === transaction.stripe_store_id)?.store_name || null : null,
            })),
            recentPayouts: payouts.slice(0, 10),
            stores,
            balances: (balanceRows || []) as StripeBalance[],
            onlineInvoices: invoiceRowsWithClients.map((invoice) => ({
                ...invoice,
                client_name: invoice.client_id ? clientsById.get(invoice.client_id) || null : null,
                store_name: invoice.stripe_store_id ? stores.find((store) => store.id === invoice.stripe_store_id)?.store_name || null : null,
            })),
        };
    }
}

export const stripeService = new StripeService();
