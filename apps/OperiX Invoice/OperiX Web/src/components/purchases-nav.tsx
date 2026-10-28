"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, FileText, Receipt, Store } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";

const SECTIONS = [
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/vendors", label: "Vendors", icon: Store },
  { href: "/supplier-bills", label: "Supplier bills", icon: FileText },
  { href: "/vendor-payments", label: "Vendor payments", icon: Banknote },
] as const;

/** Switches between the four Purchases screens, shown above each of them. */
export function PurchasesNav() {
  const pathname = usePathname() || "";
  const workspace = useWorkspace();
  if (!workspace.can("expense.view_own")) return null;
  return <nav className="purchases-nav" aria-label="Purchases">{SECTIONS.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`purchases-nav-item ${pathname === href || pathname.startsWith(`${href}/`) ? "is-active" : ""}`} aria-current={pathname === href ? "page" : undefined}><Icon size={15} aria-hidden="true" /><span>{label}</span></Link>)}</nav>;
}
