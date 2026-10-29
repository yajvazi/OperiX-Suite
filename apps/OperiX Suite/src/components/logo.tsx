import Link from "next/link";
import { href, type Lang } from "@/content/copy";

export function Logo({ lang = "en", light = false }: { lang?: Lang; light?: boolean }) {
  return <Link href={href(lang, "/")} className="logo" aria-label="OperiX">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/brand/operix-wordmark-blue.svg" className={light ? "logo-light" : undefined} alt="OperiX" width={112} height={36} />
  </Link>;
}
