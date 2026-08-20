import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

export default function NotFound() {
  return <main className="not-found-page"><span className="not-found-icon"><Search size={25} /></span><p className="eyebrow">OperiX Help Center</p><h1>We couldn&apos;t find that article.</h1><p>Search the OperiX Help Center or browse documentation by product.</p><div className="not-found-actions"><Link className="button-primary" href="/en/search">Search Documentation <ArrowRight size={16} /></Link><Link className="button-secondary" href="/en/help">Browse Products <ArrowRight size={16} /></Link></div></main>;
}
