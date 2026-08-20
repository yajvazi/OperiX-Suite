import Link from "next/link";
import { CalendarDays } from "lucide-react";

type BookingLogoProps = {
  href?: string;
  className?: string;
};

export function BookingLogo({ href, className = "" }: BookingLogoProps) {
  const logo = <span className={`operix-product-logo ${className}`.trim()}>
    <span className="operix-product-logo-mark" aria-hidden="true"><CalendarDays size={17} strokeWidth={2.1} /></span>
    <span className="operix-product-logo-copy"><strong>OperiX</strong><span>Booking</span></span>
  </span>;

  return href ? <Link href={href} aria-label="OperiX Booking dashboard">{logo}</Link> : logo;
}
