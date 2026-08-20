import Link from "next/link";
import { Grid2X2 } from "lucide-react";

type PlatformLogoProps = {
  href?: string;
  className?: string;
  onClick?: () => void;
};

export function PlatformLogo({ href = "/", className = "", onClick }: PlatformLogoProps) {
  const logo = <span className="suite-product-logo">
    <span className="suite-product-logo-mark" aria-hidden="true"><Grid2X2 size={17} strokeWidth={2.1} /></span>
    <span className="suite-product-logo-copy"><strong>OperiX</strong><span>Suite</span></span>
  </span>;

  return <Link href={href} aria-label="OperiX Suite home" onClick={onClick} className={`brand-lockup ${className}`.trim()}>{logo}</Link>;
}
