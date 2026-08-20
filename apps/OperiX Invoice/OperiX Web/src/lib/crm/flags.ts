export interface CrmFlags {
  enabled: boolean;
  syncCustomers: boolean;
  createDraftOnWon: boolean;
  deepLinksEnabled: boolean;
  webhooksEnabled: boolean;
}

export function envBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function readCrmFlags(env: Record<string, string | undefined> = process.env): CrmFlags {
  return {
    enabled: envBoolean(env.OPERIX_CRM_ENABLED),
    syncCustomers: envBoolean(env.OPERIX_CRM_SYNC_CUSTOMERS),
    createDraftOnWon: envBoolean(env.OPERIX_CRM_CREATE_DRAFT_ON_WON),
    deepLinksEnabled: envBoolean(env.OPERIX_CRM_DEEP_LINKS_ENABLED),
    webhooksEnabled: envBoolean(env.OPERIX_CRM_WEBHOOKS_ENABLED),
  };
}
