import Link from "next/link";
import { copy } from "@/content/copy";

export default function NotFound() {
  const t = copy.en.notFound;
  return <section className="page-hero"><div className="container center"><h1>{t.title}</h1><p className="lead lead-center">{t.text}</p><div className="button-row button-row-center"><Link className="button" href="/">{t.cta}</Link></div></div></section>;
}
