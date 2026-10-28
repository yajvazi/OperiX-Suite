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

// Where "new invoice" / "new quote" actions go. When the POS is enabled it is the only place
// documents are created; the invoice editor remains for editing, converting and the document
// types the POS does not cover (credit notes, advance invoices). With the POS off, the editor
// is the creation path.
export function newDocumentHref(type?: "offer"): string {
  if (POS_ENABLED) return type === "offer" ? "/pos?type=offer" : "/pos";
  return type === "offer" ? "/invoices/new?type=offer" : "/invoices/new";
}
