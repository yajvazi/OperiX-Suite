import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { businessNavigation, moreNavigation, salesNavigation, type NavigationItem } from "@/lib/navigation";
import { PageHeader } from "./ui";

export function SalesHub() {
  return <HubPage title="Sales" description="Invoices, customers, quotes, and payments in one place." items={salesNavigation} />;
}

export function BusinessHub() {
  return <HubPage title="Business" description="Keep the everyday operations of your business moving." items={businessNavigation} />;
}

export function MoreHub() {
  return <div className="ux-page"><PageHeader title="More" description="Advanced finance, documents, administration, and support." /><div className="ux-more-groups">{moreNavigation.map((group) => <section className="ux-more-group" key={group.title}><h2>{group.title}</h2><div className="ux-more-group-grid">{group.items.map((item) => <HubLink key={`${group.title}-${item.href}`} item={item} />)}</div></section>)}</div></div>;
}

function HubPage({ title, description, items }: { title: string; description: string; items: NavigationItem[] }) {
  return <div className="ux-page"><PageHeader title={title} description={description} actions={<Link href={title === "Sales" ? "/invoices/new" : "/products?create=1"} className="btn btn-primary"><Plus size={16} />{title === "Sales" ? "New invoice" : "Add item"}</Link>} /><div className="ux-hub-grid">{items.map((item) => <HubLink key={item.href} item={item} card />)}</div></div>;
}

function HubLink({ item, card = false }: { item: NavigationItem; card?: boolean }) {
  const Icon = item.icon;
  if (!card) return <Link href={item.href} className="ux-more-link"><span className="ux-more-link-icon"><Icon size={17} /></span><span><strong>{item.label}</strong>{item.description ? <small>{item.description}</small> : null}</span><ArrowRight size={15} className="ml-auto text-[#98a2b3]" /></Link>;
  return <Link href={item.href} className="ux-hub-card"><span className="ux-hub-icon"><Icon size={19} /></span><span><h2>{item.label}</h2>{item.description ? <p>{item.description}</p> : null}</span><ArrowRight className="ux-hub-arrow" size={16} /></Link>;
}
