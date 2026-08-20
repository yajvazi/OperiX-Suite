import Link from "next/link";
import { ArrowRight, Wrench } from "lucide-react";
import type { Locale } from "../content/types";
import { troubleshootingCategories } from "../content/troubleshooting";
import { copy } from "../content/ui";
import { docsPath } from "../lib/paths";
import { DocsSidebar } from "./docs-navigation";
import { SupportCta } from "./support-cta";

export function TroubleshootingPage({ locale }: { locale: Locale }) {
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="category-heading"><span className="section-icon"><Wrench size={21} /></span><p className="eyebrow">OperiX Help Center</p><h1>{copy(locale, "troubleshooting")}</h1><p>Start with the product or problem area that matches what you are seeing. Each category has a stable home for verified troubleshooting articles.</p></div><div className="troubleshooting-grid">{troubleshootingCategories.map((category) => <Link className="troubleshooting-card" href={docsPath(locale, "suite", "troubleshooting")} key={category.slug}><span className="troubleshooting-icon"><Wrench size={17} /></span><span><strong>{category.name}</strong><small>{copy(locale, "comingSoon")}</small></span><ArrowRight size={16} /></Link>)}</div><div className="problem-template"><h2>Troubleshooting article template</h2><div className="problem-template-grid"><div><span>Problem</span><strong>Describe the issue in one sentence.</strong></div><div><span>Symptoms</span><strong>List what the reader can observe.</strong></div><div><span>Possible Causes</span><strong>Keep causes specific and verified.</strong></div><div><span>Solution</span><strong>Use ordered checks and steps.</strong></div></div></div><SupportCta locale={locale} compact /></main></div></div>;
}
