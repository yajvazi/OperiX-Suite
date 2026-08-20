import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { getStartedUrl, helpCenterUrl, productOrder, productRegistry, solutionRegistry } from "@/content/products";
import { PlatformLogo } from "./platform-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <div className="footer-brand-column">
          <PlatformLogo className="brand-lockup-footer" />
          <p>One account. One organization. Multiple connected applications for the work your business does every day.</p>
          <a className="footer-help-link" href={helpCenterUrl} target="_blank" rel="noreferrer" data-analytics="help_center_clicked">Visit the Help Center <ExternalLink size={14} /></a>
        </div>
        <FooterGroup title="Products">
          {productOrder.map((key) => <Link href={productRegistry[key].marketingPath} key={key}>{productRegistry[key].name}</Link>)}
        </FooterGroup>
        <FooterGroup title="Solutions">
          {solutionRegistry.slice(0, 4).map((solution) => <Link href={solution.path} key={solution.key}>{solution.name}</Link>)}
          <Link href="/enterprise">Enterprise</Link>
        </FooterGroup>
        <FooterGroup title="Resources">
          <a href={helpCenterUrl} target="_blank" rel="noreferrer" data-analytics="help_center_clicked">Help Center <ExternalLink size={12} /></a>
          <Link href="/resources">Documentation</Link>
          <Link href="/resources#developer-documentation">Developer Documentation</Link>
          <Link href="/resources#whats-new">What’s new</Link>
          <Link href="/resources#system-status">System status</Link>
        </FooterGroup>
        <FooterGroup title="Company">
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={getStartedUrl} data-analytics="get_started_clicked">Get started <ArrowUpRight size={12} /></a>
        </FooterGroup>
      </div>
      <div className="container footer-bottom"><p>© {new Date().getFullYear()} OperiX. All rights reserved.</p><span>Built for clear, connected work.</span><span>OperiX platform</span></div>
    </footer>
  );
}

function FooterGroup({ title, children }: { title: string; children: ReactNode }) {
  return <nav className="footer-group" aria-label={`${title} links`}><h2>{title}</h2>{children}</nav>;
}
