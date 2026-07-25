import Link from "next/link";
import Image from "next/image";

export function Brand({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const source = `/operix-invoice-logo-${dark ? "blue" : "white"}.svg`;
  return <Link href="/dashboard" className="inline-flex items-center gap-3" aria-label="OperiX Invoice dashboard">
    {compact ? <Image className="brand-x-mark" src={`/operix-x-${dark ? "blue" : "white"}.svg`} width={56} height={56} alt="" aria-hidden="true" priority /> : <Image src={source} width={140} height={70} alt="OperiX Invoice" aria-hidden="true" priority />}
  </Link>;
}
