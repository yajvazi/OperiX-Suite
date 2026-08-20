import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, LockKeyhole, ShieldCheck, Users, Waypoints } from "lucide-react";
import { AppLauncherVisual, PlatformInterface } from "@/components/product-interface";
import { getStartedUrl } from "@/content/products";

export const metadata: Metadata = {
  title: "OperiX for Enterprise",
  description: "Shape an OperiX rollout around your organization, access model, integrations, and support needs.",
  alternates: { canonical: "/enterprise" },
  openGraph: { title: "OperiX for Enterprise", description: "A connected business platform built around your organization." },
};

const enterpriseAreas = [
  { title: "Organization-led rollout", text: "Bring finance, people, bookings, workplaces, and administration into the organization context that fits your operation.", icon: Waypoints, status: "Discuss with us" },
  { title: "Access and security", text: "Start with the Control capabilities your administrators need: users, roles, permissions, app access, security, integrations, and audit logs.", icon: ShieldCheck, status: "Available in Control" },
  { title: "Implementation support", text: "Talk through onboarding, data migration, custom integrations, and support expectations before you expand the platform.", icon: Users, status: "Contact Sales" },
  { title: "Deployment planning", text: "If your rollout has dedicated deployment, SLA, or advanced security requirements, the OperiX team can scope the right path with you.", icon: LockKeyhole, status: "Scope with us" },
];

const enterprisePhases = [
  { number: "01", title: "Understand the organization", text: "Map the teams, applications, permissions, and operating context you need to bring together." },
  { number: "02", title: "Shape the rollout", text: "Choose the right starting products, implementation support, integrations, and access model." },
  { number: "03", title: "Support the next stage", text: "Plan onboarding, expansion, and ongoing support around how your organization actually works." },
];

export default function EnterprisePage() {
  return (
    <>
      <section className="page-hero enterprise-hero">
        <div className="container enterprise-hero-grid">
          <div className="product-hero-copy">
            <span className="eyebrow">OperiX Enterprise</span>
            <h1>Your business platform, built around your organization.</h1>
            <p>Bring a connected set of business applications to the teams, permissions, integrations, and rollout plan your organization needs.</p>
            <div className="button-row"><Link className="button" href="/contact?type=enterprise" data-analytics="enterprise_contact_clicked">Contact Sales <ArrowRight size={16} /></Link><Link className="button button-secondary" href="/demo" data-analytics="demo_clicked">Explore the platform</Link></div>
            <p className="product-hero-foot"><Check size={15} /> Enterprise is an offering around OperiX, not another operational application.</p>
            <div className="enterprise-hero-facts"><div><span>Starting point</span><strong>One organization</strong></div><div><span>Access model</span><strong>Roles and permissions</strong></div><div><span>Rollout support</span><strong>Plan with the team</strong></div></div>
          </div>
          <div className="enterprise-side"><PlatformInterface /><span className="enterprise-side-label">Control the organization. Connect the work.</span></div>
        </div>
      </section>

      <section className="section enterprise-section">
        <div className="container">
          <div className="section-heading centered"><span className="section-label">A considered rollout</span><h2>Start with the parts of OperiX your organization needs.</h2><p>Enterprise conversations can cover the platform, individual applications, access requirements, implementation, and ongoing support. Availability is confirmed with the OperiX team.</p></div>
          <div className="enterprise-grid">{enterpriseAreas.map((area, index) => { const Icon = area.icon; return <article className="enterprise-card" key={area.title}><div className="enterprise-card-top"><span className="enterprise-card-number">0{index + 1}</span><span className="icon-box"><Icon size={19} /></span><span className="enterprise-tag">{area.status}</span></div><h3>{area.title}</h3><p>{area.text}</p></article>; })}</div>
        </div>
      </section>

      <section className="section enterprise-platform-section">
        <div className="container enterprise-grid enterprise-platform-grid"><div><span className="section-label">One connected platform</span><h2>One account. One organization. The applications your teams use.</h2><p>OperiX Suite provides the connected workspace. OperiX Control manages the platform’s organizations, users, roles, permissions, application access, security, integrations, audit logs, and system settings.</p><ul className="enterprise-checklist"><li><Check size={15} />Central application access and permissions</li><li><Check size={15} />A connected workspace for every approved product</li><li><Check size={15} />Room to expand as the organization grows</li></ul><Link className="text-link" href="/products/control">Explore OperiX Control <ArrowRight size={15} /></Link></div><AppLauncherVisual /></div>
      </section>

      <section className="section enterprise-journey-section"><div className="container"><div className="section-heading centered"><span className="section-label">A practical path forward</span><h2>Move from conversation to rollout with clarity.</h2><p>Enterprise planning starts with the organization in front of us and ends with a rollout your teams can actually use.</p></div><div className="enterprise-journey-grid">{enterprisePhases.map((phase) => <article className="enterprise-journey-card" key={phase.number}><span>{phase.number}</span><h3>{phase.title}</h3><p>{phase.text}</p></article>)}</div></div></section>

      <section className="section final-cta-section"><div className="container final-cta"><div><span className="section-label">Let’s talk</span><h2>Plan the right OperiX path for your organization.</h2><p>Tell us what you are bringing together and where you need support.</p></div><div className="button-row"><Link className="button" href="/contact?type=enterprise" data-analytics="enterprise_contact_clicked">Contact Sales <ArrowRight size={16} /></Link><a className="button button-secondary" href={getStartedUrl} data-analytics="get_started_clicked">Get started</a></div></div></section>
    </>
  );
}
