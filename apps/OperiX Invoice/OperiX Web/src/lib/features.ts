// Build-time feature flags (NEXT_PUBLIC_* values are inlined by Next.js, so set
// them before `next build`).
//
// POS is off by default. Consumer sales in Kosovo must be registered through an
// ATK-certified fiscal software (SEF), and this build does not issue fiscal
// receipts. Enable it only where the POS is used for non-fiscal sales or a
// certified fiscal module is installed.
export const POS_ENABLED = process.env.NEXT_PUBLIC_POS_ENABLED === "true";

// Shown on the POS screen. Set NEXT_PUBLIC_POS_NOTICE to an empty string to hide it.
export const POS_NOTICE = process.env.NEXT_PUBLIC_POS_NOTICE ?? "Sales made here are invoices, not fiscal receipts. They are not registered with the tax authority.";
