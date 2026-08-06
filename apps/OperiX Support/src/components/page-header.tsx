import Link from "next/link";
import { Plus } from "lucide-react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: { href: string; label: string } }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-title">{title}</h1>{description ? <p className="muted mt-1 text-sm">{description}</p> : null}</div>{action ? <Link className="btn btn-primary" href={action.href}><Plus size={17} />{action.label}</Link> : null}</div>;
}
