import Link from "next/link";
import { LockKeyhole } from "lucide-react";

const tabs = [
  { href: "/platform/overview", label: "Overview" },
  { href: "/platform/users", label: "Users" },
  { href: "/platform", label: "Workspaces & billing" },
];

export function PlatformTabs({ active }: { active: "overview" | "users" | "workspaces" }) {
  const current = active === "overview" ? "/platform/overview" : active === "users" ? "/platform/users" : "/platform";
  return <nav className="platform-tabs" aria-label="Platform sections">
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} className={tab.href === current ? "active" : ""} aria-current={tab.href === current ? "page" : undefined}>{tab.label}</Link>)}
  </nav>;
}

/** Header and tabs shared by the platform pages. */
export function PlatformNav({ active, email, title, description }: { active: "overview" | "users" | "workspaces"; email: string; title: string; description: string }) {
  return <>
    <header className="platform-header">
      <div><span className="eyebrow-label">Internal only</span><h1>{title}</h1><p>{description}</p></div>
      <div className="platform-header-actions"><span className="platform-protected"><LockKeyhole size={15} />Signed in as {email}</span></div>
    </header>
    <PlatformTabs active={active} />
  </>;
}
