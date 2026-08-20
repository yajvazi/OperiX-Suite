import Link from "next/link";
import { UsersRound } from "lucide-react";

type HrLogoProps = {
  href?: string;
  className?: string;
};

export function HrLogo({ href, className = "" }: HrLogoProps) {
  const logo = <span className={`operix-product-logo ${className}`.trim()}>
    <span className="operix-product-logo-mark" aria-hidden="true"><UsersRound size={17} strokeWidth={2.1} /></span>
    <span className="operix-product-logo-copy"><strong>OperiX</strong><span>HR</span></span>
  </span>;

  return href ? <Link href={href} aria-label="OperiX HR dashboard">{logo}</Link> : logo;
}
