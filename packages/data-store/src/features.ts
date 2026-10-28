/**
 * Free vs paid. Everything that runs on the user's device is free. Everything that needs the
 * OperiX server is part of the paid cloud plan. Servers must enforce these keys as well
 * (database policies and server routes); checks in the apps are only for showing the right UI.
 */
export const PAID_FEATURES = [
  'cloud_backup',   // cloud storage and sync between devices
  'multi_tenant',   // more than one company or subsidiary
  'team_access',    // several users, roles and permissions
  'payment_links',  // Stripe payment links
  'portal_links',   // customer portal and shared invoice links
  'developer_api',  // API keys, webhooks, request logs
  'document_scan',  // supplier bill scanning
] as const;

export type PaidFeature = (typeof PAID_FEATURES)[number];
export type PlanTier = 'free' | 'cloud';

export interface PlanState {
  tier: PlanTier;
  /** Optional per-feature grants (for example a manual or complimentary grant). */
  grants?: readonly PaidFeature[];
}

export function canUseFeature(plan: PlanState | null | undefined, feature: PaidFeature): boolean {
  if (!plan) return false;
  return plan.tier === 'cloud' || Boolean(plan.grants?.includes(feature));
}

/** Where business data lives. Free accounts are always 'local'; the cloud plan may choose either. */
export type StorageMode = 'local' | 'cloud';

export function allowedStorageModes(plan: PlanState | null | undefined): StorageMode[] {
  return canUseFeature(plan, 'cloud_backup') ? ['local', 'cloud'] : ['local'];
}
