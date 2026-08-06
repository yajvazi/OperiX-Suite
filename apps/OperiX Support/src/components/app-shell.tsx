"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Building2, ChevronLeft, CircleHelp, ClipboardList, FolderTree, LayoutDashboard, Menu, Moon, Search, Settings, Sun, Tags, Users, X, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tickets", label: "Tickets", icon: ClipboardList },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/departments", label: "Departments", icon: Building2 },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/saved-replies", label: "Saved replies", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("operix-support-theme");
    const initial = saved === "dark";
    document.documentElement.dataset.theme = initial ? "dark" : "light";
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("operix-support-theme", next ? "dark" : "light");
  }
  return <button className="grid size-10 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--blue)]" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  async function signOut() {
    await createClient()?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value) router.push(`/tickets?q=${encodeURIComponent(value)}`);
  }

  return <div className="min-h-screen">
    {mobileOpen ? <button className="fixed inset-0 z-30 bg-[#061a38]/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width,transform] duration-200 ${collapsed ? "lg:w-[76px]" : ""} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-3"><Link href="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="OperiX Support dashboard"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--blue)] text-lg font-bold text-white">O</span>{!collapsed ? <span className="min-w-0"><strong className="block truncate text-sm">OperiX Support</strong><small className="muted block text-[10px]">Help desk</small></span> : null}</Link><button className="grid size-9 place-items-center text-[var(--muted)] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={19} /></button></div>
      <nav className="grid flex-1 content-start gap-1 overflow-y-auto px-3 py-5" aria-label="Main navigation">{navigation.map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} title={collapsed ? item.label : undefined} className={`flex h-11 items-center rounded-lg transition-colors ${collapsed ? "justify-center" : "gap-3 px-3"} ${active ? "bg-[var(--blue)] text-white shadow-[0_8px_20px_rgba(0,79,254,.22)]" : "text-[#344054] hover:bg-[#f0f5ff] hover:text-[var(--blue)] dark:text-[#d0d5dd]"}`}><Icon size={18} strokeWidth={1.8} />{!collapsed ? <span className="text-[13px] font-medium">{item.label}</span> : null}</Link>; })}</nav>
      <div className="grid gap-1 border-t border-[var(--border)] p-3"><Link href="/help" className={`flex h-10 items-center rounded-lg text-[var(--muted)] hover:bg-[#f0f5ff] hover:text-[var(--blue)] ${collapsed ? "justify-center" : "gap-3 px-3"}`}><CircleHelp size={18} />{!collapsed ? <span className="text-xs">Help</span> : null}</Link><button onClick={() => setCollapsed((value) => !value)} className="hidden h-10 items-center rounded-lg text-[var(--muted)] hover:bg-[#f0f5ff] hover:text-[var(--blue)] lg:flex" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <ChevronLeft className="mx-auto rotate-180" size={18} /> : <><ChevronLeft size={18} /><span className="ml-3 text-xs">Collapse</span></>}</button></div>
    </aside>
    <div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? "lg:ml-[76px]" : "lg:ml-[232px]"}`}>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 lg:px-6"><button className="grid size-9 place-items-center text-[var(--muted)] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><form onSubmit={search} className="flex h-10 w-full max-w-[520px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3"><Search size={17} className="shrink-0 text-[var(--muted)]" /><input className="min-w-0 flex-1 bg-transparent text-xs outline-none" aria-label="Global search" placeholder="Search tickets, contacts, tags…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:block">⌘ K</kbd></form><div className="ml-auto flex items-center gap-2"><ThemeToggle /><div className="hidden items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 sm:flex"><Zap size={15} className="text-[var(--blue)]" /><span className="text-xs font-medium">Support workspace</span></div><button className="grid size-10 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[#d92d20]" onClick={signOut} aria-label="Sign out"><span className="text-xs font-semibold">↪</span></button></div></header>
      <main className="min-h-[calc(100vh-64px)]">{children}</main>
    </div>
  </div>;
}
