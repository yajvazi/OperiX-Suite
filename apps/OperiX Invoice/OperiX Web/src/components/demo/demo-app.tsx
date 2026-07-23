"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Building2,
  CircleCheck,
  Clock3,
  Eye,
  FileText,
  PackagePlus,
  Plus,
  Printer,
  Store,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { InvoiceDocument, type DocumentCompany } from "@/components/invoice-document";
import { invoiceTotals } from "@/lib/invoice-calculations";
import type { ClientRow, InvoiceDraft, InvoiceEditorItem } from "@/lib/models";
import type { DemoClient, DemoInvoice, DemoProduct } from "@/lib/demo-data";
import { useDemo } from "./demo-provider";

const demoCompany: DocumentCompany = {
  name: "Kudo Labs Demo Company",
  email: "demo@operixsuite.com",
  phone: "+383 38 700 700",
  address: "Rr. Garibaldi 12",
  city: "Prishtina, Kosovo",
  taxId: "810000999",
  bankName: "Demo Business Bank",
  iban: "XK05 1212 0000 0000 0000",
  website: "operixsuite.com",
};

export function DemoApp({ slug }: { slug: string[] }) {
  const path = slug.join("/");
  if (path === "invoices/new") return <InvoiceBuilder />;
  if (path.startsWith("invoices/")) return <InvoiceDetail id={slug[1]} />;
  if (path === "invoices") return <InvoicesView />;
  if (path === "customers") return <CustomersView />;
  if (path === "vendors") return <VendorsView />;
  if (path === "products") return <ProductsView />;
  return <DemoDashboard />;
}

function DemoDashboard() {
  const { state } = useDemo();
  const invoiceRows = useMemo(
    () => state.invoices.map((invoice) => ({ invoice, totals: invoiceTotals(invoice.draft) })),
    [state.invoices],
  );
  const revenue = invoiceRows.filter(({ invoice }) => invoice.status !== "cancelled").reduce((sum, row) => sum + row.totals.total, 0);
  const paid = invoiceRows.filter(({ invoice }) => invoice.status === "paid").reduce((sum, row) => sum + row.totals.total, 0);
  const overdue = invoiceRows.filter(({ invoice }) => invoice.status === "overdue").reduce((sum, row) => sum + row.totals.total, 0);

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-7">
      <PageHeading title="Dashboard" description="Explore a ready-to-use sample workspace with realistic business data.">
        <Link href="/demo/invoices/new" className="btn btn-primary"><FileText size={17} />Create demo invoice</Link>
      </PageHeading>
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total revenue" value={currency(revenue)} icon={WalletCards} />
        <Metric label="Paid invoices" value={currency(paid)} icon={CircleCheck} />
        <Metric label="Outstanding" value={currency(Math.max(0, revenue - paid))} icon={Clock3} />
        <Metric label="Overdue" value={currency(overdue)} icon={FileText} danger />
        <Metric label="Products in catalog" value={String(state.products.length)} icon={Boxes} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]">
        <article className="card p-5">
          <div className="flex items-center">
            <div>
              <h2 className="text-[14px] font-semibold">Revenue activity</h2>
              <p className="muted mt-1 text-[11px]">Sample invoiced totals for the current demo period.</p>
            </div>
            <Link href="/demo/invoices" className="ml-auto text-[11px] font-medium text-[#004ffe]">View invoices</Link>
          </div>
          <div className="mt-8 flex h-[230px] items-end gap-3 border-b border-[#e4e9f0] px-2">
            {[34, 52, 43, 68, 58, 82, 74, 92, 76, 100, 88, 96].map((height, index) => (
              <div key={index} className="group relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t bg-gradient-to-t from-[#004ffe] to-[#5a93ff] transition-opacity group-hover:opacity-80" style={{ height: `${height}%` }} />
              </div>
            ))}
          </div>
          <div className="muted mt-3 grid grid-cols-6 text-center text-[9px] sm:grid-cols-12">
            {["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"].map((month) => <span key={month}>{month}</span>)}
          </div>
        </article>
        <article className="card p-5">
          <div className="flex items-center"><h2 className="text-[14px] font-semibold">Recent invoices</h2><Link href="/demo/invoices" className="ml-auto text-[11px] text-[#004ffe]">View all</Link></div>
          <div className="mt-3 divide-y divide-[#edf0f4]">
            {invoiceRows.slice(0, 5).map(({ invoice, totals }) => (
              <Link href={`/demo/invoices/${invoice.id}`} key={invoice.id} className="flex items-center gap-3 py-3 hover:bg-[#fbfcff]">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-[#edf4ff] text-[#004ffe]"><FileText size={15} /></span>
                <span className="min-w-0"><strong className="block truncate text-[12px]">{invoice.draft.invoice_number}</strong><small className="muted text-[10px]">{clientName(state.clients, invoice.clientId)}</small></span>
                <span className="ml-auto text-right"><strong className="block text-[12px]">{currency(totals.total)}</strong><small className={statusText(invoice.status)}>{invoice.status}</small></span>
              </Link>
            ))}
          </div>
        </article>
      </section>
      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <QuickLink href="/demo/customers" icon={Users} title={`${state.clients.length} sample customers`} text="Browse customer details or add a local demo record." />
        <QuickLink href="/demo/vendors" icon={Store} title={`${state.vendors.length} sample vendors`} text="Explore the supplier directory and limited creation flow." />
        <QuickLink href="/demo/products" icon={PackagePlus} title={`${state.products.length} products & services`} text="Use ready-made catalog items when building an invoice." />
      </section>
    </div>
  );
}

function InvoicesView() {
  const { state } = useDemo();
  return (
    <div className="mx-auto max-w-[1500px] p-4 lg:p-7">
      <PageHeading title="Invoices" description="Review sample invoices or create your own browser-only demo invoice.">
        <Link href="/demo/invoices/new" className="btn btn-primary"><Plus size={17} />New invoice</Link>
      </PageHeading>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b bg-[#f8fafc] text-[10px] uppercase tracking-wide text-[#667085]">
              <tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Issue date</th><th className="px-5 py-3">Due date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f4]">
              {state.invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-[#fbfcff]">
                  <td className="px-5 py-4 font-semibold">{invoice.draft.invoice_number}</td>
                  <td className="px-5 py-4">{clientName(state.clients, invoice.clientId)}</td>
                  <td className="px-5 py-4 text-[#667085]">{dateLabel(invoice.draft.issue_date)}</td>
                  <td className="px-5 py-4 text-[#667085]">{dateLabel(invoice.draft.due_date)}</td>
                  <td className="px-5 py-4"><span className={statusPill(invoice.status)}>{invoice.status}</span></td>
                  <td className="px-5 py-4 text-right font-semibold">{currency(invoiceTotals(invoice.draft).total)}</td>
                  <td className="px-5 py-4"><Link href={`/demo/invoices/${invoice.id}`} className="grid h-8 w-8 place-items-center rounded-md border text-[#004ffe]" aria-label={`Open ${invoice.draft.invoice_number}`}><Eye size={15} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CustomersView() {
  const { state, addClient } = useDemo();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const added = addClient({
      name: String(data.get("name")),
      email: String(data.get("email")),
      phone: String(data.get("phone")),
      address: String(data.get("address")),
      city: String(data.get("city")),
      country: String(data.get("country") || "Kosovo"),
      taxId: String(data.get("taxId")),
    });
    setMessage(added ? "Customer added to this demo." : "Demo limit reached. Reset the demo to start again.");
    if (added) { event.currentTarget.reset(); setOpen(false); }
  }

  return (
    <EntityPage title="Customers" description={`${state.clients.length} of 8 demo customer slots used.`} button="Add customer" open={open} setOpen={setOpen}>
      {message ? <Notice>{message}</Notice> : null}
      {open ? <EntityForm title="Add demo customer" onSubmit={submit} onClose={() => setOpen(false)}>
        <Field name="name" label="Customer name" required />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Phone" />
        <Field name="taxId" label="Tax ID" />
        <Field name="address" label="Address" />
        <Field name="city" label="City" required />
        <Field name="country" label="Country" defaultValue="Kosovo" />
      </EntityForm> : null}
      <EntityTable headings={["Customer", "Contact", "Location", "Tax ID"]}>
        {state.clients.map((client) => <tr key={client.id}><Cell strong>{client.name}</Cell><Cell>{client.email}<small>{client.phone}</small></Cell><Cell>{client.city}, {client.country}</Cell><Cell>{client.taxId || "—"}</Cell></tr>)}
      </EntityTable>
    </EntityPage>
  );
}

function VendorsView() {
  const { state, addVendor } = useDemo();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const added = addVendor({
      name: String(data.get("name")),
      email: String(data.get("email")),
      phone: String(data.get("phone")),
      category: String(data.get("category")),
      city: String(data.get("city")),
    });
    setMessage(added ? "Vendor added to this demo." : "Demo limit reached. Reset the demo to start again.");
    if (added) { event.currentTarget.reset(); setOpen(false); }
  }

  return (
    <EntityPage title="Vendors" description={`${state.vendors.length} of 8 demo vendor slots used.`} button="Add vendor" open={open} setOpen={setOpen}>
      {message ? <Notice>{message}</Notice> : null}
      {open ? <EntityForm title="Add demo vendor" onSubmit={submit} onClose={() => setOpen(false)}>
        <Field name="name" label="Vendor name" required />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Phone" />
        <Field name="category" label="Category" required />
        <Field name="city" label="City" required />
      </EntityForm> : null}
      <EntityTable headings={["Vendor", "Contact", "Category", "City"]}>
        {state.vendors.map((vendor) => <tr key={vendor.id}><Cell strong>{vendor.name}</Cell><Cell>{vendor.email}<small>{vendor.phone}</small></Cell><Cell>{vendor.category}</Cell><Cell>{vendor.city}</Cell></tr>)}
      </EntityTable>
    </EntityPage>
  );
}

function ProductsView() {
  const { state, addProduct } = useDemo();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const added = addProduct({
      name: String(data.get("name")),
      description: String(data.get("description")),
      sku: String(data.get("sku")),
      unitPrice: Number(data.get("unitPrice")),
      taxRate: Number(data.get("taxRate") || 18),
      unit: String(data.get("unit") || "pcs"),
      stock: Number(data.get("stock") || 0),
      category: String(data.get("category")),
    });
    setMessage(added ? "Product added to this demo." : "Demo limit reached. Reset the demo to start again.");
    if (added) { event.currentTarget.reset(); setOpen(false); }
  }

  return (
    <EntityPage title="Products & Services" description={`${state.products.length} of 16 demo product slots used.`} button="Add product" open={open} setOpen={setOpen}>
      {message ? <Notice>{message}</Notice> : null}
      {open ? <EntityForm title="Add demo product" onSubmit={submit} onClose={() => setOpen(false)}>
        <Field name="name" label="Name" required />
        <Field name="sku" label="SKU" required />
        <Field name="description" label="Description" />
        <Field name="category" label="Category" required />
        <Field name="unitPrice" label="Unit price" type="number" step="0.01" required />
        <Field name="taxRate" label="Tax rate %" type="number" defaultValue="18" required />
        <Field name="stock" label="Stock" type="number" defaultValue="10" />
        <Field name="unit" label="Unit" defaultValue="pcs" />
      </EntityForm> : null}
      <EntityTable headings={["Product", "SKU", "Category", "Stock", "Unit price"]}>
        {state.products.map((product) => <tr key={product.id}><Cell strong>{product.name}<small>{product.description}</small></Cell><Cell>{product.sku}</Cell><Cell>{product.category}</Cell><Cell>{product.stock >= 999 ? "Service" : product.stock}</Cell><Cell strong>{currency(product.unitPrice)}</Cell></tr>)}
      </EntityTable>
    </EntityPage>
  );
}

function InvoiceBuilder() {
  const { state, addInvoice } = useDemo();
  const router = useRouter();
  const firstProduct = state.products[0];
  const [clientId, setClientId] = useState(state.clients[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState("2026-07-23");
  const [dueDate, setDueDate] = useState("2026-08-06");
  const [notes, setNotes] = useState("Thank you for your business.");
  const [items, setItems] = useState<InvoiceEditorItem[]>(() => firstProduct ? [productLine(firstProduct)] : []);
  const totals = invoiceTotals({ items });
  const invoiceNumber = `INV-2026-${String(43 + state.invoices.length).padStart(4, "0")}`;

  function addLine() {
    const product = state.products[0];
    if (product) setItems((current) => [...current, productLine(product)]);
  }

  function updateLine(id: string, patch: Partial<InvoiceEditorItem>) {
    setItems((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  function selectProduct(lineId: string, productId: string) {
    const product = state.products.find((entry) => entry.id === productId);
    if (product) updateLine(lineId, {
      product_id: product.id,
      description: product.name,
      unit_price: product.unitPrice,
      tax_rate: product.taxRate,
      unit: product.unit,
      sku: product.sku,
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId || !items.length) return;
    const id = `invoice-${Date.now()}`;
    const draft: InvoiceDraft = {
      client_id: clientId,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      payment_method: "bank",
      amount_received: 0,
      notes,
      status: "draft",
      items,
    };
    const added = addInvoice({ id, clientId, status: "draft", createdAt: new Date().toISOString(), draft });
    if (added) router.push(`/demo/invoices/${id}`);
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-[1500px] p-4 lg:p-7">
      <PageHeading title="Create invoice" description="Build a realistic invoice using the demo customer and product catalog.">
        <Link href="/demo/invoices" className="btn"><ArrowLeft size={16} />Cancel</Link>
        <button type="submit" className="btn btn-primary">Save & preview</button>
      </PageHeading>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid gap-4">
          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <label className="field sm:col-span-2"><span>Customer</span><select className="select" value={clientId} onChange={(event) => setClientId(event.target.value)} required>{state.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <label className="field"><span>Invoice number</span><input className="input" value={invoiceNumber} readOnly /></label>
            <label className="field"><span>Payment method</span><select className="select" defaultValue="bank"><option value="bank">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option></select></label>
            <label className="field"><span>Issue date</span><input className="input" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required /></label>
            <label className="field"><span>Due date</span><input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
          </section>
          <section className="card overflow-hidden">
            <div className="flex items-center border-b px-5 py-4"><h2 className="text-sm font-semibold">Invoice items</h2><button type="button" onClick={addLine} className="ml-auto text-xs font-medium text-[#004ffe]"><Plus size={15} className="inline" /> Add line</button></div>
            <div className="grid gap-3 p-4">
              {items.map((entry, index) => (
                <div key={entry.id} className="grid items-end gap-3 rounded-lg border border-[#e4e9f0] p-3 lg:grid-cols-[minmax(220px,1.5fr)_100px_130px_90px_36px]">
                  <label className="field"><span>Product or service</span><select className="select" value={entry.product_id} onChange={(event) => selectProduct(entry.id, event.target.value)}>{state.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                  <label className="field"><span>Quantity</span><input className="input" type="number" min="0.01" step="0.01" value={entry.quantity} onChange={(event) => updateLine(entry.id, { quantity: Number(event.target.value) })} /></label>
                  <label className="field"><span>Unit price</span><input className="input" type="number" min="0" step="0.01" value={entry.unit_price} onChange={(event) => updateLine(entry.id, { unit_price: Number(event.target.value) })} /></label>
                  <div><span className="mb-1.5 block text-[11px] font-medium text-[#344054]">Line total</span><strong className="block h-10 py-2.5 text-xs">{currency(entry.quantity * entry.unit_price * (1 + entry.tax_rate / 100))}</strong></div>
                  <button type="button" onClick={() => setItems((current) => current.filter((line) => line.id !== entry.id))} disabled={items.length === 1} className="grid h-10 w-9 place-items-center rounded-md text-[#98a2b3] hover:bg-[#fff3f2] hover:text-[#d92d20]" aria-label={`Remove line ${index + 1}`}><X size={16} /></button>
                </div>
              ))}
            </div>
          </section>
          <section className="card p-5"><label className="field"><span>Notes</span><textarea className="textarea min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} /></label></section>
        </div>
        <aside className="card h-fit p-5 xl:sticky xl:top-24">
          <h2 className="text-sm font-semibold">Invoice summary</h2>
          <div className="mt-5 grid gap-3 text-xs">
            <SummaryRow label="Subtotal" value={currency(totals.subtotal)} />
            <SummaryRow label="Discount" value={`−${currency(totals.discount)}`} />
            <SummaryRow label="VAT" value={currency(totals.tax)} />
            <div className="mt-2 flex items-center border-t pt-4"><strong>Total</strong><strong className="ml-auto text-xl text-[#004ffe]">{currency(totals.total)}</strong></div>
          </div>
          <button type="submit" className="btn btn-primary mt-6 w-full">Save & preview invoice</button>
          <p className="muted mt-4 text-center text-[10px] leading-4">This demo invoice is stored only in your browser and is never sent to a real customer.</p>
        </aside>
      </div>
    </form>
  );
}

function InvoiceDetail({ id }: { id?: string }) {
  const { state } = useDemo();
  const invoice = state.invoices.find((entry) => entry.id === id);
  if (!invoice) return <EmptyState title="Invoice not found" text="This demo invoice may have been removed when the sample data was reset." href="/demo/invoices" />;
  const client = state.clients.find((entry) => entry.id === invoice.clientId);
  const clientRow: ClientRow | undefined = client ? {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    address: client.address,
    city: client.city,
    country: client.country,
    tax_id: client.taxId,
    created_at: "2026-01-01T00:00:00.000Z",
  } : undefined;

  return (
    <div className="invoice-workspace">
      <div className="invoice-commandbar no-print">
        <Link href="/demo/invoices" className="invoice-preview-back"><ArrowLeft size={15} />Invoices</Link>
        <div className="invoice-command-title"><span className="muted text-[10px]">DEMO INVOICE</span><div className="invoice-title-row"><h1>{invoice.draft.invoice_number}</h1><span className={statusPill(invoice.status)}>{invoice.status}</span></div></div>
        <div className="invoice-command-actions"><button onClick={() => window.print()} className="btn"><Printer size={16} />Print preview</button><Link href="/demo/invoices/new" className="btn btn-primary"><Plus size={16} />New invoice</Link></div>
      </div>
      <div className="mx-auto max-w-[900px]">
        <div className="mb-4 rounded-lg border border-[#b8d2ff] bg-[#edf4ff] px-4 py-3 text-xs text-[#174ea6] no-print">
          This is a safe demo preview. No email, payment request, or accounting record has been created.
        </div>
        <div className="invoice-document-panel">
          <div className="invoice-document-panel-head"><span>A4 invoice preview</span><span>{client?.name}</span></div>
          <div className="invoice-document-canvas"><InvoiceDocument draft={invoice.draft} client={clientRow} company={demoCompany} /></div>
        </div>
      </div>
    </div>
  );
}

function EntityPage({ title, description, button, open, setOpen, children }: { title: string; description: string; button: string; open: boolean; setOpen: (value: boolean) => void; children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1500px] p-4 lg:p-7"><PageHeading title={title} description={description}><button onClick={() => setOpen(!open)} className="btn btn-primary">{open ? <X size={16} /> : <Plus size={16} />}{open ? "Close" : button}</button></PageHeading>{children}</div>;
}

function EntityForm({ title, onSubmit, onClose, children }: { title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void; children: React.ReactNode }) {
  return <form onSubmit={onSubmit} className="card mb-4 p-5"><div className="mb-4 flex items-center"><h2 className="text-sm font-semibold">{title}</h2><button type="button" onClick={onClose} className="ml-auto text-[#667085]" aria-label="Close form"><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn">Cancel</button><button type="submit" className="btn btn-primary">Add to demo</button></div></form>;
}

function EntityTable({ headings, children }: { headings: string[]; children: React.ReactNode }) {
  return <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b bg-[#f8fafc] text-[10px] uppercase tracking-wide text-[#667085]"><tr>{headings.map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0f4] [&_td]:px-5 [&_td]:py-4">{children}</tbody></table></div></div>;
}

function Field({ name, label, type = "text", required, defaultValue, step }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; step?: string }) {
  return <label className="field"><span>{label}</span><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} step={step} /></label>;
}

function Cell({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <td>{strong ? <strong>{children}</strong> : children}</td>;
}

function PageHeading({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <header className="mb-5 flex flex-wrap items-end gap-4"><div className="min-w-[220px] flex-1"><h1 className="page-title">{title}</h1><p className="muted mt-1.5 text-xs">{description}</p></div>{children ? <div className="flex flex-wrap gap-2">{children}</div> : null}</header>;
}

function Metric({ label, value, icon: Icon, danger }: { label: string; value: string; icon: typeof FileText; danger?: boolean }) {
  return <article className="card min-h-[112px] p-4"><div className="flex items-start justify-between"><span className="muted text-[11px]">{label}</span><span className={`grid h-8 w-8 place-items-center rounded-md ${danger ? "bg-[#fff0ef] text-[#ef4444]" : "bg-[#edf4ff] text-[#004ffe]"}`}><Icon size={17} /></span></div><strong className="mt-2 block text-xl tracking-[-.03em]">{value}</strong></article>;
}

function QuickLink({ href, icon: Icon, title, text }: { href: string; icon: typeof Building2; title: string; text: string }) {
  return <Link href={href} className="card flex min-h-[112px] items-center gap-4 p-5 transition-transform hover:-translate-y-0.5 hover:shadow-md"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#edf4ff] text-[#004ffe]"><Icon size={19} /></span><span><strong className="block text-[13px]">{title}</strong><small className="muted mt-1 block text-[10px] leading-4">{text}</small></span></Link>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center"><span className="text-[#667085]">{label}</span><strong className="ml-auto">{value}</strong></div>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-md border border-[#b8d2ff] bg-[#edf4ff] px-4 py-3 text-xs text-[#174ea6]" role="status">{children}</p>;
}

function EmptyState({ title, text, href }: { title: string; text: string; href: string }) {
  return <div className="mx-auto max-w-lg p-8 text-center"><div className="card p-8"><FileText className="mx-auto text-[#004ffe]" /><h1 className="mt-4 text-xl font-semibold">{title}</h1><p className="muted mt-2 text-xs">{text}</p><Link href={href} className="btn btn-primary mt-5">Return to invoices</Link></div></div>;
}

function productLine(product: DemoProduct): InvoiceEditorItem {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    product_id: product.id,
    description: product.name,
    quantity: 1,
    unit_price: product.unitPrice,
    tax_rate: product.taxRate,
    discount: 0,
    unit: product.unit,
    sku: product.sku,
  };
}

function clientName(clients: DemoClient[], id: string) {
  return clients.find((client) => client.id === id)?.name ?? "Unknown customer";
}

function currency(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function statusText(status: DemoInvoice["status"]) {
  return status === "paid" ? "text-[#12b76a]" : status === "overdue" ? "text-[#ef4444]" : "text-[#004ffe]";
}

function statusPill(status: DemoInvoice["status"]) {
  return `inline-flex rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${status === "paid" ? "bg-[#ecfdf3] text-[#027a48]" : status === "overdue" ? "bg-[#fff0ef] text-[#d92d20]" : status === "draft" ? "bg-[#f2f4f7] text-[#475467]" : "bg-[#edf4ff] text-[#004ffe]"}`;
}
