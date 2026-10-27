import { supabase } from '@invoice-monorepo/api';

export type MobileInvoiceBillingSummary = {
    company_id: string;
    billing_account_company_id: string;
    requested_product: string;
    plan: 'invoice' | 'suite' | 'booking' | 'enterprise' | null;
    product: string;
    entitlements: Record<string, boolean>;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    status: string;
    billing_interval: 'monthly' | 'annual' | null;
    trial_started_at: string | null;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    grace_period_ends_at: string | null;
    scheduled_plan: 'invoice' | 'suite' | null;
    scheduled_change_at: string | null;
    total_tenants: number;
    included_tenants: number;
    billable_tenants: number;
    total_users: number;
    included_users: number;
    billable_users: number;
    estimated_monthly_total: string | number | null;
    estimated_annual_total: string | number | null;
    restricted: boolean;
    billing_management_allowed: boolean;
    usage_updated_at: string | null;
};

export async function getInvoiceBillingSummary(companyId: string) {
    const { data, error } = await supabase.rpc('get_product_billing_summary', { p_company_id: companyId, p_product: 'invoice' });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as MobileInvoiceBillingSummary | undefined;
    if (!row) throw new Error('Billing information is unavailable for this workspace.');
    return {
        ...row,
        total_tenants: Number(row.total_tenants || 0),
        included_tenants: Number(row.included_tenants || 1),
        billable_tenants: Number(row.billable_tenants || 0),
        total_users: Number(row.total_users || 0),
        included_users: Number(row.included_users || 1),
        billable_users: Number(row.billable_users || 0),
    };
}
