import Link from "next/link";
import { CircleHelp } from "lucide-react";

type HelpCenterLogoProps = {
  href: string;
  className?: string;
};

export function HelpCenterLogo({ href, className = "" }: HelpCenterLogoProps) {
  return <Link href={href} aria-label="OperiX Help Center home" className={`docs-product-logo ${className}`.trim()}>
    <span className="docs-product-logo-mark" aria-hidden="true"><CircleHelp size={17} strokeWidth={2.1} /></span>
    <span className="docs-product-logo-copy"><strong>OperiX</strong><span>Help Center</span></span>
  </Link>;
}
