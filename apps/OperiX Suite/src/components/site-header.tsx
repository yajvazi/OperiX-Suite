"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getStartedUrl, helpCenterUrl, productOrder, productRegistry, solutionRegistry, signInUrl } from "@/content/products";
import { navigation } from "@/content/site";
import { ProductIcon } from "./product-interface";
import { PlatformLogo } from "./platform-logo";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function closeMenus() {
    setMobileOpen(false);
    setProductsOpen(false);
    setSolutionsOpen(false);
  }

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="container nav-inner">
        <PlatformLogo onClick={closeMenus} />

        <nav className="desktop-nav" aria-label="Primary navigation">
          <div className="nav-menu-wrap">
            <button className={`nav-menu-trigger ${productsOpen ? "is-open" : ""}`} type="button" aria-expanded={productsOpen} onClick={() => { setProductsOpen((value) => !value); setSolutionsOpen(false); }}>
              Products <ChevronDown size={14} />
            </button>
            {productsOpen ? <ProductsMenu onSelect={closeMenus} /> : null}
          </div>
          <div className="nav-menu-wrap">
            <button className={`nav-menu-trigger ${solutionsOpen ? "is-open" : ""}`} type="button" aria-expanded={solutionsOpen} onClick={() => { setSolutionsOpen((value) => !value); setProductsOpen(false); }}>
              Solutions <ChevronDown size={14} />
            </button>
            {solutionsOpen ? <SolutionsMenu onSelect={closeMenus} /> : null}
          </div>
          {navigation.filter((item) => !item.menu || item.label === "Resources").map((item) => item.label === "Resources" ? <Link key={item.label} href={item.href}>{item.label}</Link> : null)}
          <Link href="/enterprise">Enterprise</Link>
        </nav>

        <div className="nav-actions">
          <a href={signInUrl} className="nav-sign-in" data-analytics="sign_in_clicked">Sign in</a>
          <Link href="/demo" className="button button-ghost button-small" data-analytics="demo_clicked">Explore demo</Link>
          <a href={getStartedUrl} className="button button-small" data-analytics="get_started_clicked">Get started</a>
        </div>

        <button className="menu-button" type="button" aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} onClick={() => setMobileOpen((value) => !value)}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <div className={`mobile-panel ${mobileOpen ? "is-open" : ""}`} id="mobile-navigation">
        <nav aria-label="Mobile navigation">
          <div className="mobile-nav-section">
            <button type="button" className="mobile-nav-trigger" onClick={() => setProductsOpen((value) => !value)} aria-expanded={productsOpen}>Products <ChevronDown size={17} className={productsOpen ? "rotated" : ""} /></button>
            {productsOpen ? <div className="mobile-subnav">{productOrder.map((key) => { const product = productRegistry[key]; return <Link href={product.marketingPath} key={key} onClick={closeMenus}><span className="mobile-product-icon" style={{ ["--product-accent" as string]: product.accent }}><ProductIcon product={key} size={16} /></span><span><strong>{product.name}</strong><small>{product.navigationDescription}</small></span></Link>; })}</div> : null}
          </div>
          <div className="mobile-nav-section">
            <button type="button" className="mobile-nav-trigger" onClick={() => setSolutionsOpen((value) => !value)} aria-expanded={solutionsOpen}>Solutions <ChevronDown size={17} className={solutionsOpen ? "rotated" : ""} /></button>
            {solutionsOpen ? <div className="mobile-subnav">{solutionRegistry.map((solution) => <Link href={solution.path} key={solution.key} onClick={closeMenus}><span className="mobile-product-icon"><solution.icon size={16} /></span><span><strong>{solution.name}</strong><small>{solution.description}</small></span></Link>)}</div> : null}
          </div>
          <Link href="/pricing" onClick={closeMenus}>Pricing</Link>
          <Link href="/resources" onClick={closeMenus}>Resources</Link>
          <Link href="/enterprise" onClick={closeMenus}>Enterprise</Link>
          <a href={helpCenterUrl} target="_blank" rel="noreferrer" onClick={closeMenus}>Help Center <ExternalLink size={14} /></a>
          <a href={signInUrl} onClick={closeMenus}>Sign in</a>
          <div className="mobile-actions"><Link href="/demo" className="button button-ghost" onClick={closeMenus} data-analytics="demo_clicked">Explore demo</Link><a href={getStartedUrl} className="button" onClick={closeMenus} data-analytics="get_started_clicked">Get started</a></div>
        </nav>
      </div>
    </header>
  );
}
function ProductsMenu({ onSelect }: { onSelect: () => void }) {
  return <div className="mega-menu mega-products"><div className="mega-menu-intro"><span className="menu-caption">PRODUCTS</span><strong>One account.<br />Every OperiX app.</strong><p>Specialized workspaces for the work your business does every day.</p><Link href="/products/suite" onClick={onSelect}>See the connected platform <span>→</span></Link></div><div className="mega-menu-products">{productOrder.map((key) => { const product = productRegistry[key]; return <Link href={product.marketingPath} key={key} className="mega-product-link" onClick={onSelect}><span className="mega-product-icon" style={{ ["--product-accent" as string]: product.accent }}><ProductIcon product={key} size={18} /></span><span><strong>{product.name}</strong><small>{product.navigationDescription}</small></span></Link>; })}</div></div>;
}

function SolutionsMenu({ onSelect }: { onSelect: () => void }) {
  return <div className="mega-menu mega-solutions"><div className="mega-menu-intro"><span className="menu-caption">SOLUTIONS</span><strong>Start with the work<br />that matters most.</strong><p>Bring the right OperiX applications around a business problem.</p><Link href="/solutions/small-business" onClick={onSelect}>Explore solutions <span>→</span></Link></div><div className="mega-solution-grid">{solutionRegistry.map((solution) => <Link href={solution.path} key={solution.key} className="mega-solution-link" onClick={onSelect}><span className="mega-product-icon"><solution.icon size={17} /></span><span><strong>{solution.name}</strong><small>{solution.description}</small></span></Link>)}</div></div>;
}
