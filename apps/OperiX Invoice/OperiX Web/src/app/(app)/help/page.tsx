"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronDown, CircleHelp, FileText,
  Mail, MessageCircle, Phone, Search, ShieldCheck, Sparkles, WalletCards,
} from "lucide-react";

type Category = "All topics" | "Getting started" | "Invoices" | "Payments" | "Account & settings";
type Faq = { question: string; answer: string; category: Exclude<Category, "All topics"> };

const categories: Array<{ label: Category; icon: typeof BookOpen }> = [
  { label: "All topics", icon: BookOpen },
  { label: "Getting started", icon: Sparkles },
  { label: "Invoices", icon: FileText },
  { label: "Payments", icon: WalletCards },
  { label: "Account & settings", icon: ShieldCheck },
];

const faqs: Faq[] = [
  { category: "Getting started", question: "How do I create my first invoice?", answer: "Open POS from the navigation, choose a customer, add products or a custom item, review the totals, then select Save Invoice or Pay & Complete. Your invoice is saved to the shared workspace immediately." },
  { category: "Getting started", question: "Can I use the same account on mobile and web?", answer: "Yes. Sign in with the same OperiX account on both apps. Invoices, customers, products, payments and settings are shared through your workspace." },
  { category: "Invoices", question: "How do I edit an existing invoice?", answer: "Open Invoices, select the invoice number to view its preview, then choose Edit. Make your changes and select Update to save them to the same invoice." },
  { category: "Invoices", question: "How do I download or print an invoice?", answer: "Open the invoice preview and choose Download PDF or Print A4. OperiX generates a clean, single-page A4 document without browser URL or timestamp footers." },
  { category: "Invoices", question: "What invoice types are available?", answer: "POS supports Invoice, Quote, Proforma invoice and Order. Choose the document type from the selector at the top of the invoice panel before adding items." },
  { category: "Payments", question: "How is tax calculated?", answer: "Tax is calculated from the product and invoice tax rates. The default rate is 18%, and you can adjust the invoice rate or the rate for individual products before completing the sale." },
  { category: "Payments", question: "Can I record a partial payment?", answer: "Yes. Choose Cash, enter the amount received, and OperiX will calculate the amount due or change. Bank and card payments can also be recorded from the payment controls." },
  { category: "Account & settings", question: "How do I update my company details?", answer: "Open Settings and update your company profile, contact information, bank details, currency, invoice template and document preferences. These details are used in future documents." },
  { category: "Account & settings", question: "Is my workspace data secure?", answer: "Your workspace is protected by account authentication and row-level access controls. Only members with access to your workspace can view or manage its business data." },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All topics");
  const [open, setOpen] = useState<string | null>(faqs[0].question);
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => faqs.filter((item) => {
    const matchesCategory = category === "All topics" || item.category === category;
    const matchesQuery = !normalized || `${item.question} ${item.answer} ${item.category}`.toLowerCase().includes(normalized);
    return matchesCategory && matchesQuery;
  }), [category, normalized]);

  return <div className="help-page mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <section className="help-hero overflow-hidden rounded-2xl bg-[#061a38] px-5 py-8 text-white sm:px-8 sm:py-10 lg:px-12">
      <div className="relative z-10 max-w-2xl">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#004ffe] shadow-[0_10px_30px_rgba(0,79,254,.35)]"><CircleHelp size={22}/></div>
        <h1 className="text-3xl font-semibold tracking-[-.03em] sm:text-4xl">How can we help?</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base">Find answers, learn the essentials, and get in touch with the OperiX Invoice support team.</p>
        <label className="mt-7 flex h-12 max-w-xl items-center gap-3 rounded-xl bg-white px-4 text-[#667085] shadow-[0_10px_35px_rgba(0,0,0,.18)]"><Search size={19} className="shrink-0 text-[#004ffe]"/><input aria-label="Search help articles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions and topics…" className="min-w-0 flex-1 bg-transparent text-sm text-[#101828] outline-none placeholder:text-[#98a2b3]"/>{query && <button type="button" onClick={() => setQuery("")} className="text-xs font-medium text-[#004ffe]">Clear</button>}</label>
      </div>
      <div className="help-hero-orb" aria-hidden="true"/>
    </section>

    <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start"><p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#98a2b3]">Browse topics</p><nav className="grid gap-1" aria-label="Help categories">{categories.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => setCategory(label)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${category === label ? "bg-[#edf4ff] font-semibold text-[#004ffe]" : "text-[#475467] hover:bg-white hover:text-[#101828]"}`}><Icon size={17}/><span>{label}</span></button>)}</nav></aside>

      <main className="min-w-0">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-.02em] text-[#101828]">Frequently asked questions</h2><p className="mt-1 text-sm text-[#667085]">{filtered.length} {filtered.length === 1 ? "answer" : "answers"} for {category.toLowerCase()}{query ? ` matching “${query}”` : ""}.</p></div><Link href="/pos" className="btn btn-primary whitespace-nowrap">Create an invoice <ArrowRight size={16}/></Link></div>
        <div className="overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-[0_4px_18px_rgba(16,24,40,.035)]">{filtered.length ? filtered.map((item) => <div key={item.question} className="border-b border-[#edf0f4] last:border-0"><button type="button" className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6" aria-expanded={open === item.question} onClick={() => setOpen(open === item.question ? null : item.question)}><span className="text-sm font-semibold text-[#25324a]">{item.question}</span><ChevronDown size={18} className={`shrink-0 text-[#98a2b3] transition-transform ${open === item.question ? "rotate-180 text-[#004ffe]" : ""}`}/></button>{open === item.question && <div className="px-5 pb-5 pr-10 text-sm leading-6 text-[#667085] sm:px-6 sm:pb-6">{item.answer}</div>}</div>) : <div className="px-6 py-14 text-center"><Search className="mx-auto text-[#98a2b3]" size={28}/><h3 className="mt-3 text-sm font-semibold text-[#25324a]">No matching answers</h3><p className="mt-1 text-xs text-[#667085]">Try a different search or browse another topic.</p><button type="button" onClick={() => { setQuery(""); setCategory("All topics"); }} className="mt-4 text-xs font-semibold text-[#004ffe]">Clear filters</button></div>}</div>

        <section className="mt-8"><div className="mb-4"><h2 className="text-xl font-semibold tracking-[-.02em] text-[#101828]">Need more help?</h2><p className="mt-1 text-sm text-[#667085]">Our support team is here when you need a hand.</p></div><div className="grid gap-4 sm:grid-cols-3"><a href="mailto:support@operixinvoice.com" className="help-contact-card"><span className="help-contact-icon"><Mail size={18}/></span><span><strong>Email support</strong><small>support@operixinvoice.com</small></span><ArrowRight size={16} className="ml-auto text-[#98a2b3]"/></a><a href="tel:+38348480804" className="help-contact-card"><span className="help-contact-icon"><Phone size={18}/></span><span><strong>Call support</strong><small>+383 48 480 804</small></span><ArrowRight size={16} className="ml-auto text-[#98a2b3]"/></a><a href="mailto:support@operixinvoice.com?subject=OperiX%20Invoice%20support" className="help-contact-card"><span className="help-contact-icon"><MessageCircle size={18}/></span><span><strong>Contact us</strong><small>Tell us what you need</small></span><ArrowRight size={16} className="ml-auto text-[#98a2b3]"/></a></div></section>
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-[#dbe7ff] bg-[#f5f8ff] p-4 text-xs leading-5 text-[#475467]"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#004ffe]"/><p><strong className="text-[#25324a]">Tip:</strong> Include your invoice number, workspace name, and a screenshot when contacting support so we can help faster.</p></div>
      </main>
    </div>
  </div>;
}
