import { decidePaywall, type PaywallDecision } from '@invoice-monorepo/billing';
import { getInvoiceBillingSummary } from './billingService';
import { getConnectedServer } from './serverConnection';
import { getStorageMode } from './storageMode';
import { getWorkspaceScope } from './workspace';

export interface WorkspacePaywall extends PaywallDecision {
    companyId: string;
}

/** Hosted service only: set EXPO_PUBLIC_PAYWALL_ENABLED=true in the build. Never applies to your own server or on-device data. */
export function paywallEnabled() {
    return process.env.EXPO_PUBLIC_PAYWALL_ENABLED === 'true' && !getConnectedServer();
}

/**
 * Does this user's cloud workspace need a subscription? Returns null when no paywall applies: not enabled, data kept
 * on this device, a platform administrator, no cloud company yet, or the status could not be read (the database
 * enforces limits on its own, so reading problems never lock anyone out).
 */
export async function checkWorkspacePaywall(userId: string, options: { evenIfOnDevice?: boolean } = {}): Promise<WorkspacePaywall | null> {
    if (!paywallEnabled()) return null;
    try {
        // Free on-device data needs no subscription, except when the user is about to switch to the cloud.
        if (!options.evenIfOnDevice && await getStorageMode() === 'local') return null;
        const scope = await getWorkspaceScope(userId, { forceCloud: true });
        if (scope.platformAdmin) return null;
        const decision = decidePaywall(await getInvoiceBillingSummary(scope.companyId));
        return decision.requiresPayment ? { ...decision, companyId: scope.companyId } : null;
    } catch {
        return null;
    }
}
