"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Boxes, Building2, ChevronDown, ChevronLeft, CircleHelp, CreditCard, FileBarChart,
  FileText, HandCoins, LayoutDashboard, Menu, PackageOpen, Plus, ReceiptText, Search, Settings,
  ShoppingBag, ShoppingCart, Store, Users, WalletCards, X, Download, LogOut, ScrollText, ExternalLink,
} from "lucide-react";
import { Brand } from "./brand";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useBusinessData } from "@/hooks/use-business-data";
import type { InvoiceRow } from "@/lib/models";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/invoices", label: "Invoices", icon: FileText, children: [{ href: "/quotes", label: "Quotes", icon: ReceiptText }, { href: "/recurring", label: "Recurring Invoices", icon: ReceiptText }] },
  { href: "/payments", label: "Payments", icon: CreditCard, children: [{ href: "/reminders", label: "Payment Reminders", icon: Bell }, { href: "/payment-links", label: "Online Payments", icon: CreditCard }, { href: "/income", label: "Income", icon: HandCoins }, { href: "/expenses", label: "Expenses", icon: WalletCards }] },
  { href: "/customers", label: "Customers", icon: Users, children: [{ href: "/portal-links", label: "Customer Portal", icon: ExternalLink }] },
  { href: "/reports", label: "Reports", icon: FileBarChart, children: [{ href: "/tax-reports", label: "VAT & Tax Reports", icon: FileBarChart }] },
  { href: "/vendors", label: "Vendors", icon: Store },
  { href: "/products", label: "Products & Services", icon: Boxes },
  { href: "/settings", label: "Settings", icon: Settings },
];

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const workspace=useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false); const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState(""); const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(new Set());
  const [companies,setCompanies]=useState<Array<{id:string;name:string}>>([]); const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({ invoices:false, payments:false, customers:false, reports:false });
  const [searchedInvoices,setSearchedInvoices]=useState<InvoiceRow[]>([]);
  const invoicesQuery=useBusinessData<InvoiceRow>("invoices","id,invoice_number,client_id,total_amount,status,due_date,client:clients(name)");
  const invoices=invoicesQuery.data;

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  useEffect(()=>{if(!workspace.user)return;const supabase=createClient();if(!supabase)return;void supabase.from("memberships").select("company_id, company:companies(id,company_name,name)").eq("user_id",workspace.user.id).then(({data})=>{setCompanies((data||[]).flatMap(row=>{const value=Array.isArray(row.company)?row.company[0]:row.company;return value?[{id:String(value.id),name:String(value.company_name||value.name||"Company")}]:[]}));});},[workspace.user]);

  const results = useMemo(() => query ? nav.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())) : nav.slice(0, 6), [query]);
  useEffect(()=>{const normalized=query.trim();if(normalized.length<2){queueMicrotask(()=>setSearchedInvoices([]));return;}const supabase=createClient();if(!supabase)return;let active=true;void supabase.from("invoices").select("id,invoice_number,total_amount,status,due_date,client:clients(name)").ilike("invoice_number",`%${normalized}%`).limit(8).then(({data})=>{if(active)setSearchedInvoices((data||[]) as unknown as InvoiceRow[]);});return()=>{active=false;};},[query]);
  const matchingInvoices=useMemo(()=>{const normalized=query.trim().toLowerCase();if(!normalized)return [];const byId=new Map([...invoices,...searchedInvoices].map(invoice=>[invoice.id,invoice]));return [...byId.values()].filter(invoice=>invoice.invoice_number.toLowerCase().includes(normalized)||(invoice.client?.name||"").toLowerCase().includes(normalized)).slice(0,8);},[invoices,searchedInvoices,query]);
  const notifications=useMemo(()=>{const now=new Date();const end=new Date(now);end.setDate(end.getDate()+7);return invoices.filter(invoice=>{if(dismissedNotificationIds.has(invoice.id)||["paid","cancelled"].includes(invoice.status)||!invoice.due_date)return false;const due=new Date(invoice.due_date);return due<now||due<=end;}).map(invoice=>({id:invoice.id,invoice,overdue:new Date(invoice.due_date||"")<now}));},[invoices,dismissedNotificationIds]);
  async function signOut() { const supabase = createClient(); if (supabase) await supabase.auth.signOut(); router.push("/login"); router.refresh(); }
  async function switchCompany(companyId:string){const supabase=createClient();if(!supabase||!workspace.user)return;const {error}=await supabase.from("profiles").update({active_company_id:companyId,company_id:companyId}).eq("id",workspace.user.id);if(!error){await workspace.refresh();router.refresh();}}
  async function install() { if (installEvent) { await installEvent.prompt(); await installEvent.userChoice; setInstallEvent(null); } }

  return <div className={`min-h-screen ${collapsed ? "lg:[--sidebar-width:76px]" : ""}`}>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-[#061a38]/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
    <aside className={`fixed z-40 inset-y-0 left-0 w-[224px] lg:w-[var(--sidebar-width)] bg-white text-[#344054] border-r border-[#e4e9f0] transition-[width,transform] duration-200 overflow-hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className="h-20 px-5 flex items-center justify-between border-b border-[#e4e9f0]"><Brand dark compact={collapsed}/><button className="lg:hidden text-[#667085]" onClick={() => setMobileOpen(false)}><X size={20}/></button></div>
      <nav className="sidebar-nav-scroll px-3 py-5 grid gap-1 overflow-y-auto overflow-x-hidden h-[calc(100vh-144px)]" aria-label="Main navigation">
        {nav.map((item) => { const active = path === item.href || path.startsWith(item.href + "/"); const Icon = item.icon; const menuKey=item.href.slice(1); const expanded=expandedMenus[menuKey] ?? false; return <div key={item.href} className="grid gap-1"><div className="relative"><Link onClick={() => setMobileOpen(false)} href={item.href} title={collapsed ? item.label : undefined} className={`h-[43px] px-3 rounded-[7px] flex items-center gap-3 whitespace-nowrap transition-colors ${active ? "bg-[#004ffe] text-white shadow-[0_8px_20px_rgba(0,79,254,.22)]" : "text-[#344054] hover:text-[#004ffe] hover:bg-[#f7f9fc]"}`}><Icon size={19} strokeWidth={1.8}/>{!collapsed && <span className="text-[13px] font-medium">{item.label}</span>}</Link>{!collapsed && item.children?.length ? <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`} onClick={()=>setExpandedMenus(current=>({...current,[menuKey]:!expanded}))} className="absolute right-2 top-0 grid h-[43px] w-8 place-items-center rounded text-[#98a2b3] hover:bg-[#f7f9fc] hover:text-[#004ffe]"><ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`}/></button> : null}</div>{!collapsed && expanded && item.children?.map(child=>{const ChildIcon=child.icon;return <Link onClick={() => setMobileOpen(false)} key={child.href} href={child.href} className={`ml-5 h-8 rounded-md px-3 flex items-center gap-2 text-[11px] whitespace-nowrap ${path === child.href || path.startsWith(child.href + "/") ? "bg-[#edf4ff] text-[#004ffe]" : "text-[#667085] hover:bg-[#f7f9fc] hover:text-[#004ffe]"}`}><ChildIcon size={14} strokeWidth={1.8}/>{child.label}</Link>})}</div>; })}
      </nav>
      <button className="absolute bottom-4 left-3 right-3 h-10 px-3 flex items-center gap-3 text-[#667085] hover:text-[#004ffe]" onClick={() => setCollapsed((value) => !value)}><ChevronLeft size={19} className={`transition-transform ${collapsed ? "rotate-180" : ""}`}/>{!collapsed && <span className="text-xs">Collapse</span>}</button>
    </aside>

    <div className="lg:ml-[var(--sidebar-width)] transition-[margin] duration-200 min-h-screen">
      <header className="no-print sticky top-0 z-20 h-16 bg-white border-b border-[#e4e9f0] px-4 lg:px-6 flex items-center gap-3">
        <button className="mobile-menu-button w-8 h-10 grid place-items-center border-0 bg-transparent p-0 shadow-none text-[#344054]" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <button className="h-10 w-full max-w-[370px] min-w-0 border border-[#e4e9f0] rounded-[7px] bg-white text-[#98a2b3] px-3 flex items-center gap-2 text-[12px]" onClick={() => setSearchOpen(true)}><Search size={18} className="shrink-0"/><span className="min-w-0 truncate whitespace-nowrap">Search anything…</span><kbd className="ml-auto hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] sm:block">⌘ K</kbd></button>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/invoices/new" className="icon-btn bg-[#004ffe] border-[#004ffe] text-white" aria-label="Create invoice"><Plus size={20}/></Link>
          {installEvent && <button className="icon-btn hidden sm:grid" onClick={install} title="Install OperiX"><Download size={18}/></button>}
          <Link href="/help" className="icon-btn hidden sm:grid" aria-label="Help"><CircleHelp size={18}/></Link>
          <div className="relative"><button className="icon-btn relative" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}><Bell size={18}/>{notifications.length>0?<span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-[#004ffe] text-white text-[9px] grid place-items-center">{notifications.length>9?"9+":notifications.length}</span>:null}</button>{notificationsOpen?<div className="notification-popover absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] card p-3 shadow-xl" role="dialog" aria-label="Notifications"><div className="mb-1 flex items-center justify-between border-b pb-2"><strong className="text-sm">Notifications</strong><div className="flex items-center gap-2"><span className="muted text-[10px]">Next 7 days</span>{notifications.length>0?<button type="button" onClick={()=>setDismissedNotificationIds(new Set(notifications.map(item=>item.id)))} className="text-[10px] font-medium text-[#004ffe] hover:underline">Clear</button>:null}</div></div>{invoicesQuery.loading?<p className="muted p-5 text-center text-xs">Loading notifications…</p>:invoicesQuery.error?<p className="p-5 text-center text-xs text-[#d92d20]">Unable to load notifications.</p>:notifications.length?<> {notifications.map(item=><Link href={`/invoices/${item.invoice.id}`} key={item.id} onClick={()=>setNotificationsOpen(false)} className="block rounded-md p-3 hover:bg-[#f7f9fc]"><strong className="block text-xs">{item.overdue?"Overdue invoice":"Invoice due soon"}</strong><span className="mt-1 block text-[11px]">{item.invoice.invoice_number} · {item.invoice.client?.name||"Customer"}</span><span className={`mt-1 block text-[10px] ${item.overdue?"text-[#d92d20]":"muted"}`}>{item.overdue?"Payment is overdue":`Due ${item.invoice.due_date}`}</span></Link>)}<Link href="/invoices" onClick={()=>setNotificationsOpen(false)} className="mt-1 block border-t px-3 pt-3 text-center text-xs font-medium text-[#004ffe]">View all invoices</Link></>:<p className="muted p-5 text-center text-xs">You’re all caught up.</p>}</div>:null}</div>
          <details className="relative group"><summary className="list-none h-10 border border-[#e4e9f0] rounded-[7px] flex items-center gap-2 px-3 cursor-pointer"><Building2 size={17}/><span className="hidden md:block text-xs font-medium max-w-36 truncate">{workspace.company?.company_name||workspace.company?.name||workspace.profile?.company_name||"Company"}</span><ChevronDown size={14}/></summary><div className="absolute right-0 top-12 w-56 card p-1.5 shadow-xl">{companies.length>1?<div className="border-b pb-1 mb-1">{companies.map(item=><button key={item.id} onClick={()=>switchCompany(item.id)} className={`w-full text-left p-2 rounded text-xs ${workspace.companyId===item.id?"bg-[#edf4ff] text-[#004ffe]":"hover:bg-[#f7f9fc]"}`}>{item.name}</button>)}</div>:null}<Link href="/settings" className="flex items-center gap-2 p-2.5 rounded hover:bg-[#f7f9fc] text-xs"><Building2 size={16}/>Company settings</Link><button onClick={signOut} className="w-full flex items-center gap-2 p-2.5 rounded hover:bg-[#fff3f2] text-xs text-[#d92d20]"><LogOut size={16}/>Sign out</button></div></details>
        </div>
      </header>
      <main className="min-h-[calc(100vh-64px)]">{children}</main>
    </div>

    {searchOpen && <div className="fixed inset-0 z-50 bg-[#061a38]/45 p-4 flex justify-center items-start pt-[12vh]" onMouseDown={() => {setSearchOpen(false);setQuery("")}}><section className="w-full max-w-xl card shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}><div className="flex items-center gap-3 border-b p-4"><Search size={20} className="text-[#004ffe]"/><input autoFocus className="w-full outline-none" placeholder="Search modules, invoice numbers and customers…" value={query} onChange={(e) => setQuery(e.target.value)}/><button onClick={() => {setSearchOpen(false);setQuery("")}} aria-label="Close search"><X size={19}/></button></div><div className="p-2">{matchingInvoices.length?<><p className="px-3 pt-2 pb-1 muted text-[10px] uppercase tracking-wide">Invoices</p>{matchingInvoices.map(invoice=><Link onClick={() => {setSearchOpen(false);setQuery("")}} key={invoice.id} href={`/invoices/preview/${encodeURIComponent(invoice.invoice_number)}`} className="flex items-center gap-3 p-3 rounded-md hover:bg-[#f4f7fb]"><FileText size={18} className="text-[#004ffe]"/><span><strong className="block text-xs">{invoice.invoice_number}</strong><small className="muted">{invoice.client?.name||"Customer"} · {moneyValue(invoice.total_amount)}</small></span></Link>)}</>:null}{results.map((item) => { const Icon = item.icon; return <Link onClick={() => {setSearchOpen(false);setQuery("")}} key={item.href} href={item.href} className="flex items-center gap-3 p-3 rounded-md hover:bg-[#f4f7fb]"><Icon size={18} className="text-[#004ffe]"/><span>{item.label}</span></Link>; })}{query&&!matchingInvoices.length&&!results.length?<p className="muted text-xs p-5 text-center">No invoices or modules found.</p>:null}</div></section></div>}
  </div>;
}

function moneyValue(value:number){return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(value)||0);}

export const secondaryModules = [
  { href: "/supplier-bills", label: "Supplier Bills", icon: ShoppingBag },
  { href: "/contracts", label: "Contracts", icon: ScrollText },
  { href: "/management", label: "Management", icon: Building2 },
  { href: "/inventory", label: "Inventory", icon: PackageOpen },
];
