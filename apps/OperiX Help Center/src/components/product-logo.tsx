import Link from "next/link";

type HelpCenterLogoProps = {
  href: string;
  className?: string;
  light?: boolean;
};

export function HelpCenterLogo({ href, className = "", light = false }: HelpCenterLogoProps) {
  return <Link href={href} aria-label="OperiX Help Center home" className={`docs-product-logo ${className}`.trim()}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={light ? "logo-light" : undefined} src="/brand/operix-wordmark-blue.svg" alt="OperiX" width={104} height={34} />
    <span className="logo-divider" aria-hidden="true" />
    <span className="logo-label">Help Center</span>
  </Link>;
}
