export function supportUrl() {
  return process.env.NEXT_PUBLIC_SUPPORT_URL?.trim() || null;
}

/** Where people can write to the OperiX team. */
export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@operixinvoice.com";

export function supportMailto(subject: string) {
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
}
