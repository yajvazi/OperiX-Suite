/**
 * Decides whether a cloud workspace must pay before it can be used. Web and mobile share this so they agree.
 *
 * Paid means an active subscription or an active manual grant (the billing summary reports a grant as "active").
 * A trial, an expired or cancelled subscription, or no subscription at all means the paywall is shown.
 * "past_due" keeps working: Stripe is still retrying the payment and the workspace has a grace period.
 */
export interface PaywallSummaryInput {
  status?: string | null;
  restricted?: boolean | null;
  billing_management_allowed?: boolean | null;
}

export type PaywallReason = "paid" | "grace" | "trial" | "expired" | "none";

export interface PaywallDecision {
  /** True when the workspace must subscribe before it can be used. */
  requiresPayment: boolean;
  reason: PaywallReason;
  /** True when the signed-in user may start the payment (an administrator). Others are told to ask one. */
  canPay: boolean;
}

export function decidePaywall(summary: PaywallSummaryInput | null | undefined): PaywallDecision {
  const canPay = Boolean(summary?.billing_management_allowed);
  const status = String(summary?.status || "").toLowerCase();
  if (!summary) return { requiresPayment: true, reason: "none", canPay };
  if (status === "active") return { requiresPayment: Boolean(summary.restricted), reason: summary.restricted ? "expired" : "paid", canPay };
  if (status === "past_due") return { requiresPayment: false, reason: "grace", canPay };
  if (status === "trialing") return { requiresPayment: true, reason: "trial", canPay };
  if (!status) return { requiresPayment: true, reason: "none", canPay };
  return { requiresPayment: true, reason: "expired", canPay };
}
