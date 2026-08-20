"use client";

import { Globe2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useHrLocale } from "@/lib/i18n";
import { useHrWorkspace } from "@/lib/workspace";
import { Card, PageHeader, StatusBadge } from "./ui";

export function SettingsView() {
  const { workspace } = useHrWorkspace();
  const { locale, setLocale } = useHrLocale();
  return <><PageHeader title="Settings" description="Organization preferences for your OperiX HR workspace." /><div className="settings-grid"><Card title="Language & locale"><div className="settings-row"><span className="settings-row-icon"><Globe2 size={17} /></span><div><strong>Interface language</strong><p>English and Albanian are available across the HR client.</p></div><select className="select-control" value={locale} onChange={(event) => setLocale(event.target.value as "en" | "sq")}><option value="en">English</option><option value="sq">Shqip</option></select></div><div className="settings-row"><span className="settings-row-icon"><SlidersHorizontal size={17} /></span><div><strong>Currency</strong><p>Organization default</p></div><span className="setting-value">{workspace?.company?.currency || "EUR"}</span></div><div className="settings-row"><span className="settings-row-icon"><Globe2 size={17} /></span><div><strong>Timezone</strong><p>Use organization settings for attendance cutoffs.</p></div><span className="setting-value">Europe/Belgrade</span></div></Card><Card title="Workspace access"><div className="settings-row"><span className="settings-row-icon"><ShieldCheck size={17} /></span><div><strong>Shared OperiX identity</strong><p>{workspace?.user?.email || "Authenticated user"}</p></div><StatusBadge status="active" /></div><div className="settings-row"><div><strong>Organization</strong><p>{workspace?.company?.company_name || workspace?.company?.name || "Not selected"}</p></div><span className="setting-value">{workspace?.companyIds.length || 0} workspace(s)</span></div><div className="security-note"><ShieldCheck size={17} /><span>HR data is isolated by organization membership, database RLS, server-side permission checks, and private storage policies.</span></div></Card></div></>;
}
