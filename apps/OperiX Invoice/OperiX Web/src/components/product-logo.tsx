import Link from "next/link";
import { ReceiptText } from "lucide-react";

type InvoiceLogoProps = {
  href?: string;
  className?: string;
};

export function InvoiceLogo({ href, className = "" }: InvoiceLogoProps) {
  const logo = <span className={`operix-product-logo ${className}`.trim()}>
    <span className="operix-product-logo-mark" aria-hidden="true"><ReceiptText size={17} strokeWidth={2.1} /></span>
    <span className="operix-product-logo-copy"><strong>OperiX</strong><span>Invoice</span></span>
  </span>;

  return href ? <Link href={href} aria-label="OperiX Invoice dashboard">{logo}</Link> : logo;
}
