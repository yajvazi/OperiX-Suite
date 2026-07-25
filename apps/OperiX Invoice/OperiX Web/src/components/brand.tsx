import Link from "next/link";
import Image from "next/image";

export function Brand({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const source = `/operix-invoice-logo-${dark ? "blue" : "white"}.svg`;
  return <Link href="/dashboard" className="inline-flex items-center gap-3" aria-label="OperiX Invoice dashboard">
    {compact ? <Image src={`/operix-x-${dark ? "blue" : "white"}.svg`} width={58} height={40} alt="" aria-hidden="true" priority /> : <Image src={source} width={140} height={70} alt="OperiX Invoice" aria-hidden="true" priority />}
  </Link>;
}
