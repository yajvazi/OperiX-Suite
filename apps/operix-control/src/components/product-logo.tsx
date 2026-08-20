import Link from "next/link";
import { ShieldCheck } from "lucide-react";

type ControlLogoProps = {
  href?: string;
  className?: string;
};

export function ControlLogo({ href, className = "" }: ControlLogoProps) {
  const logo = <span className={`operix-product-logo ${className}`.trim()}>
    <span className="operix-product-logo-mark" aria-hidden="true"><ShieldCheck size={17} strokeWidth={2.1} /></span>
    <span className="operix-product-logo-copy"><strong>OperiX</strong><span>Control</span></span>
  </span>;

  return href ? <Link href={href} aria-label="OperiX Control dashboard">{logo}</Link> : logo;
}
