"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Boxes,
  FileText,
  LayoutDashboard,
  Menu,
  Plus,
  RotateCcw,
  Store,
  Users,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { useDemo } from "./demo-provider";

const demoNav = [
  { href: "/demo", label: "Dashboard", icon: LayoutDashboard },
  { href: "/demo/invoices", label: "Invoices", icon: FileText },
  { href: "/demo/customers", label: "Customers", icon: Users },
  { href: "/demo/vendors", label: "Vendors", icon: Store },
  { href: "/demo/products", label: "Products & Services", icon: Boxes },
];

export function DemoShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { reset } = useDemo();
  const [mobileOpen, setMobileOpen] = useState(false);

  function resetDemo() {
    if (window.confirm("Reset all demo changes and restore the sample data?")) reset();
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      {mobileOpen ? (
        <button
          className="fixed inset-0 z-30 bg-[#061a38]/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[224px] overflow-hidden bg-[#061a38] text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between border-b border-white/8 px-5">
          <Brand />
          <button className="text-white/70 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>
        <div className="mx-3 mt-4 rounded-lg border border-[#3388ff]/30 bg-[#004ffe]/16 px-3 py-2.5">
          <strong className="block text-[11px] font-semibold text-[#8cc2ff]">DEMO WORKSPACE</strong>
          <span className="mt-1 block text-[10px] leading-4 text-white/60">Sample data stored only in this browser.</span>
        </div>
        <nav className="grid gap-1 px-3 py-4" aria-label="Demo navigation">
          {demoNav.map((item) => {
            const active = item.href === "/demo" ? path === "/demo" : path.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex h-[43px] items-center gap-3 rounded-[7px] px-3 text-[13px] font-medium transition-colors ${active ? "bg-[#004ffe] text-white shadow-[0_8px_20px_rgba(0,79,254,.22)]" : "text-white/80 hover:bg-white/7 hover:text-white"}`}
              >
                <Icon size={19} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={resetDemo} className="absolute bottom-4 left-3 right-3 flex h-10 items-center gap-3 rounded-md px-3 text-xs text-white/65 hover:bg-white/7 hover:text-white">
          <RotateCcw size={17} />
          Reset demo data
        </button>
      </aside>

      <div className="min-h-screen lg:ml-[224px]">
        <div className="flex min-h-9 items-center justify-center gap-2 bg-[#edf4ff] px-4 py-2 text-center text-[11px] text-[#174ea6]">
          <strong>OperiX Invoice demo</strong>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Changes stay on this device and can be reset at any time.</span>
        </div>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#e4e9f0] bg-white px-4 lg:px-6">
          <button className="grid h-10 w-9 place-items-center text-[#344054] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div>
            <strong className="block text-sm text-[#111827]">Kudo Labs Demo Company</strong>
            <span className="block text-[10px] text-[#667085]">EUR · VAT 18%</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={resetDemo} className="btn hidden sm:inline-flex">
              <RotateCcw size={15} />
              Reset
            </button>
            <Link href="/demo/invoices/new" className="btn btn-primary">
              <Plus size={17} />
              <span className="hidden sm:inline">New invoice</span>
            </Link>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
