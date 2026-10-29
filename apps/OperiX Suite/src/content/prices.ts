/** Public prices in EUR. Keep in step with packages/billing (PLAN_DEFINITIONS): the billing package is the source of truth for checkout. */
export const prices = {
  invoice: { monthly: 2.99, annual: 29.99 },
  suite: { monthly: 4.99, annual: 49.99 },
  booking: { monthly: 4.99, annual: 49.99 },
  extraWorkspace: { monthly: 1.99, annual: 19.99 },
  extraUser: { monthly: 0.99, annual: 9.99 },
  api: { monthly: 4.99, requests: 5000 },
} as const;

export const euro = (value: number) => `€${value.toFixed(2)}`;
