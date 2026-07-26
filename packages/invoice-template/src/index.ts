import type { InvoiceData, TemplateConfig } from "@invoice-monorepo/types";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character] || character));

const date = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${parsed.getFullYear()}`;
};

const money = (value: number, currency = "EUR") => `${new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0)} ${escapeHtml(currency)}`;

const safeUrl = (value?: string) => escapeHtml(value || "");

const style = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
.operix-invoice { width: 186mm; min-height: 277mm; margin: 0 auto; padding: 0; font-size: 10px; display: flex; flex-direction: column; }
.invoice-header { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: start; padding-bottom: 7px; border-bottom: 1.5px solid #111; }
.invoice-brand { font-size: 26px; line-height: 1.05; font-weight: 800; text-transform: uppercase; letter-spacing: .2px; }
.invoice-brand img { display: block; max-width: 150px; max-height: 34px; margin-bottom: 5px; object-fit: contain; }
.invoice-brand-logo { width: auto; }
.invoice-qr { display: block; width: 28mm; height: 28mm; margin: 0 0 2px auto; object-fit: contain; }
.invoice-balance-secondary-label { display: block; margin-top: 4px; font-size: 8px; font-weight: 600; text-transform: none; color: #4b5563; }
.invoice-type { margin-top: 7px; font-size: 14px; font-weight: 700; text-transform: uppercase; }
.invoice-number { margin-top: 2px; font-size: 15px; font-weight: 800; }
.invoice-balance { min-width: 170px; text-align: right; }
.invoice-balance-label, .invoice-balance-value, .invoice-status { display: none !important; }
.invoice-balance-label { font-size: 9px; font-weight: 700; }
.invoice-balance-value { margin-top: 3px; font-size: 18px; font-weight: 800; }
.invoice-status { display: inline-block; margin-top: 5px; padding: 3px 9px; border: 1px solid #777; border-radius: 2px; font-size: 9px; font-weight: 700; }
.invoice-people { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 8px 0 9px; border-bottom: 1px solid #aaa; }
.person-block { min-width: 0; }
.person-title { padding-bottom: 3px; border-bottom: 1px solid #bbb; font-size: 9px; font-weight: 700; }
.person-name { margin: 4px 0 5px; font-size: 11px; font-weight: 700; }
.person-grid { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; row-gap: 2px; line-height: 1.25; }
.person-label { font-weight: 700; white-space: nowrap; }
.invoice-meta { display: grid; grid-template-columns: repeat(6, 1fr); margin-top: 9px; border: 1px solid #999; }
.meta-cell { min-height: 36px; padding: 5px 6px; border-right: 1px solid #999; }
.meta-cell:last-child { border-right: 0; }
.meta-label { display: block; margin-bottom: 4px; font-size: 8px; font-weight: 700; }
.meta-value { font-size: 9px; font-weight: 600; overflow-wrap: anywhere; }
.invoice-items { width: 100%; margin-top: 10px; border-collapse: collapse; font-size: 8px; }
.invoice-items th { padding: 5px 4px; border: 1px solid #111; background: #333; color: #fff; font-size: 7.5px; font-weight: 700; text-align: center; }
.invoice-items td { padding: 5px 4px; border: 1px solid #222; vertical-align: top; }
.invoice-items th.description, .invoice-items td.description { text-align: left; }
.invoice-items th.number, .invoice-items td.number { width: 25px; text-align: center; }
.invoice-items td.numeric { text-align: right; white-space: nowrap; }
.invoice-items td.center { text-align: center; }
.invoice-summary { display: grid; grid-template-columns: 1fr 285px; gap: 20px; align-items: start; margin-top: 9px; }
.invoice-note { font-size: 8px; line-height: 1.35; }
.invoice-totals { width: 100%; border-collapse: collapse; font-size: 9px; }
.invoice-totals td { padding: 3px 0; }
.invoice-totals td:last-child { text-align: right; white-space: nowrap; }
.invoice-totals .grand td { padding-top: 6px; border-top: 1.5px solid #111; border-bottom: 1.5px solid #111; font-size: 12px; font-weight: 800; }
.invoice-totals .grand { display: none; }
.paid-stamp { display: none !important; }
.paid-stamp { display: inline-block; margin-top: 8px; padding: 6px 12px; border: 1.5px solid #0b67c2; color: #0b67c2; transform: rotate(-6deg); font-weight: 800; letter-spacing: 1px; }
.paid-stamp small { display: block; margin-top: 2px; font-size: 7px; letter-spacing: 0; text-align: center; }
.invoice-foot { margin-top: auto; padding-top: 9px; }
.signature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; align-items: end; }
.signature-cell { text-align: center; font-size: 8px; }
.signature-line { height: 45px; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid #111; }
.signature-line img { max-width: 100%; max-height: 42px; object-fit: contain; filter: brightness(0) saturate(100%) invert(26%) sepia(87%) saturate(2046%) hue-rotate(194deg) brightness(87%) contrast(101%); }
.signature-caption { padding-top: 4px; font-weight: 600; }
.company-footer { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 10px; padding-top: 6px; border-top: 1px solid #111; font-size: 7.5px; line-height: 1.3; }
.company-footer > div:nth-child(2) { text-align: center; }
.company-footer > div:last-child { text-align: right; }
@media print { @page { size: A4; margin: 0; } html, body { width: 210mm; min-height: 297mm; } body { padding: 11mm 12mm 9mm; } .operix-invoice { width: auto; min-height: 277mm; } }
@media screen and (max-width: 760px) {
  html, body { width: 100%; min-height: 0; overflow-x: hidden; }
  body { padding: 0; }
  .operix-invoice { width: 100%; min-height: 0; font-size: clamp(6px, 2.25vw, 10px); }
  .invoice-header { gap: 8px; }
  .invoice-balance { min-width: 0; }
  .invoice-qr { width: 18vw; height: 18vw; max-width: 28mm; max-height: 28mm; }
  .invoice-meta { grid-template-columns: repeat(3, 1fr); }
  .invoice-items { table-layout: fixed; font-size: 6px; }
  .invoice-items th, .invoice-items td { padding: 3px 2px; overflow-wrap: anywhere; }
  .invoice-summary { grid-template-columns: 1fr; }
  .invoice-totals { max-width: 100%; margin-left: 0; }
  .signature-grid { gap: 4px; }
  .company-footer { gap: 5px; font-size: 6px; }
}
`;

type Config = Partial<TemplateConfig> & { visibleColumns?: Partial<TemplateConfig["visibleColumns"]> };

const labelsFor = (data: InvoiceData) => {
  const albanian = data.details.language === "sq" || data.details.language === "al";
  const labels = albanian ? {
    invoice: "Faturë", billTo: "Fatura Për", shipTo: "Malli Për", issue: "Data e faturës", due: "Afati për pagesë",
    department: "Njësia Org.", reference: "Referenca", yourReference: "Referenti i juaj", terms: "Kushtet", number: "Nr.", sku: "Shifra",
    description: "Përshkrimi", quantity: "Sasia", unit: "Njësia", price: "Çmimi pa TVSH", discount: "Rabati", tax: "TVSH %",
    netPrice: "Çmimi me rabat", salePrice: "Çmimi shitës", lineTotal: "Vlera shitëse", beforeDiscount: "Vlera pa rabat", extraDiscount: "Rabati shtesë",
    beforeTax: "Vlera pa TVSH", taxTotal: "TVSH", amountDue: "TOTALI", remaining: "", paid: "",
    billedBy: "Faturoi", sentBy: "Dërgoi", checkedBy: "Kontrolloi", acceptedBy: "Pranoi", fullName: "Emri i plotë", bank: "Banka",
  } : {
    invoice: "Invoice", billTo: "Billed to", shipTo: "Delivered to", issue: "Issue date", due: "Due date", department: "Department",
    reference: "Reference", yourReference: "Your reference", terms: "Terms", number: "No.", sku: "SKU", description: "Description", quantity: "Qty",
    unit: "Unit", price: "Price excl. VAT", discount: "Discount", tax: "VAT %", netPrice: "Price after discount", salePrice: "Sale price",
    lineTotal: "Line total", beforeDiscount: "Subtotal", extraDiscount: "Additional discount", beforeTax: "Net amount", taxTotal: "VAT", amountDue: "Amount due",
    remaining: "", paid: "", billedBy: "Prepared by", sentBy: "Sent by", checkedBy: "Checked by", acceptedBy: "Accepted by", fullName: "Full name", bank: "Bank",
  };
  return { ...labels, ...(data.config?.labels || {}) };
};

const value = (input: unknown) => escapeHtml(input || "—");

export function corporateInvoiceMarkup(data: InvoiceData): string {
  const config: Config = data.config || {};
  const columns = { rowNumber: true, sku: true, description: true, quantity: true, unit: true, unitPrice: true, discount: true, taxRate: true, lineTotal: true, grossPrice: true, ...(config.visibleColumns || {}) };
  const labels = labelsFor(data);
  const items = data.items || [];
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discount = items.reduce((sum, item) => sum + item.quantity * item.price * ((item.discount || 0) / 100), 0);
  const net = items.reduce((sum, item) => sum + item.total, 0);
  const tax = items.reduce((sum, item) => sum + item.total * ((item.taxRate || 0) / 100), 0);
  const total = net + tax;
  const received = Number(data.details.amountReceived ?? data.summary.amountReceived ?? 0);
  const due = Math.max(0, total - received);
  const paid = received >= total && total > 0;
  const currency = data.details.currency || "EUR";
  const type = data.details.subtype === "offer" || data.details.type === "offer" ? (data.details.language === "sq" ? "Ofertë" : "Offer") : labels.invoice;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`https://invoice.operixsuite.com/qr/${data.details.number}`)}&color=000000`;
  const clientAddress = data.client.address || "";
  const deliveryName = data.client.deliveryName || data.client.name;
  const deliveryAddress = data.client.deliveryAddress || clientAddress;
  const deliveryContact = data.client.deliveryContact || data.client.phone || data.client.email;
  const row = (item: InvoiceData["items"][number], index: number) => {
    const taxRate = Number(item.taxRate || 0);
    const discountRate = Number(item.discount || 0);
    const netPrice = item.price * (1 - discountRate / 100);
    const grossPrice = netPrice * (1 + taxRate / 100);
    return `<tr>${columns.rowNumber ? `<td class="number">${index + 1}</td>` : ""}${columns.sku ? `<td>${value(item.sku)}</td>` : ""}${columns.description ? `<td class="description">${value(item.description)}</td>` : ""}${columns.quantity ? `<td class="numeric">${item.quantity}</td>` : ""}${columns.unit ? `<td class="center">${value(item.unit || "pcs")}</td>` : ""}${columns.unitPrice ? `<td class="numeric">${money(item.price, currency)}</td>` : ""}${columns.discount ? `<td class="numeric">${discountRate}%</td>` : ""}${columns.taxRate ? `<td class="numeric">${taxRate}%</td>` : ""}${columns.grossPrice ? `<td class="numeric">${money(netPrice, currency)}</td>` : ""}${columns.lineTotal ? `<td class="numeric"><strong>${money(item.total + item.total * taxRate / 100, currency)}</strong></td>` : ""}</tr>`;
  };
  const header = `${columns.rowNumber ? `<th class="number">${labels.number}</th>` : ""}${columns.sku ? `<th>${labels.sku}</th>` : ""}${columns.description ? `<th class="description">${labels.description}</th>` : ""}${columns.quantity ? `<th>${labels.quantity}</th>` : ""}${columns.unit ? `<th>${labels.unit}</th>` : ""}${columns.unitPrice ? `<th>${labels.price}</th>` : ""}${columns.discount ? `<th>${labels.discount}</th>` : ""}${columns.taxRate ? `<th>${labels.tax}</th>` : ""}${columns.grossPrice ? `<th>${labels.salePrice}</th>` : ""}${columns.lineTotal ? `<th>${labels.lineTotal}</th>` : ""}`;
  const person = (title: string, name: string, address: string, contact: string, taxId = "") => `<section class="person-block"><div class="person-title">${title}</div><div class="person-name">${value(name)}</div><div class="person-grid"><span class="person-label">${data.details.language === "sq" || data.details.language === "al" ? "NUI:" : "Tax ID:"}</span><span>${value(taxId || data.client.taxId)}</span><span class="person-label">${data.details.language === "sq" || data.details.language === "al" ? "Kontakt:" : "Contact:"}</span><span>${value(contact)}</span><span class="person-label">${data.details.language === "sq" || data.details.language === "al" ? "Adresa:" : "Address:"}</span><span>${value(address)}</span></div></section>`;
  const sign = (caption: string, image?: string) => `<div class="signature-cell"><div class="signature-line">${image ? `<img src="${safeUrl(image)}" alt="${escapeHtml(caption)}"/>` : ""}</div><div class="signature-caption">${caption}</div></div>`;
  const companyAddress = [data.company.address, data.company.city, data.company.country].filter(Boolean).join(", ");
  return `<style>${style}</style><article class="operix-invoice"><header class="invoice-header"><div>${config.showLogo !== false && data.company.logoUrl ? `<img class="invoice-brand invoice-brand-logo" src="${safeUrl(data.company.logoUrl)}" alt="${value(data.company.name)}"/>` : `<div class="invoice-brand">${value(data.company.name || "OperiX")}</div>`}<div class="invoice-type">${escapeHtml(type)}: ${value(data.details.number)}</div></div><div class="invoice-balance"><img class="invoice-qr" src="${qr}" alt="Invoice QR code"/><div class="invoice-balance-label">${labels.remaining}</div><div class="invoice-balance-value">${money(paid ? 0 : due, currency)}</div><div class="invoice-status">${paid ? labels.paid : value(data.details.paymentMethod || "—")}</div></div></header><div class="invoice-people">${person(labels.billTo, data.client.name, clientAddress, data.client.email, data.client.taxId || data.client.nui)}${person(labels.shipTo, deliveryName, deliveryAddress, deliveryContact, data.client.vatNumber || data.client.fiscalNumber)}</div><div class="invoice-meta"><div class="meta-cell"><span class="meta-label">${labels.department}</span><span class="meta-value">${value(data.details.department)}</span></div><div class="meta-cell"><span class="meta-label">${labels.issue}</span><span class="meta-value">${date(data.details.issueDate)}</span></div><div class="meta-cell"><span class="meta-label">${labels.due}</span><span class="meta-value">${date(data.details.dueDate)}</span></div><div class="meta-cell"><span class="meta-label">${labels.reference}</span><span class="meta-value">${value(data.details.reference)}</span></div><div class="meta-cell"><span class="meta-label">${labels.yourReference}</span><span class="meta-value">${value(data.details.yourReference)}</span></div><div class="meta-cell"><span class="meta-label">${labels.terms}</span><span class="meta-value">${value(data.details.paymentTerms || "NET 10")}</span></div></div><table class="invoice-items"><thead><tr>${header}</tr></thead><tbody>${items.map(row).join("")}</tbody></table><div class="invoice-summary"><div class="invoice-note">${config.showNotes && (data.details.notes || data.details.terms) ? `<strong>${labels.terms}</strong><br/>${value(data.details.notes || data.details.terms)}` : ""}${paid && config.showStamp !== false ? `<div class="paid-stamp">${labels.paid}<small>${date(new Date().toISOString())}</small></div>` : ""}</div><table class="invoice-totals"><tr><td>${labels.beforeDiscount}:</td><td>${money(subtotal, currency)}</td></tr>${config.showDiscount !== false ? `<tr><td>${labels.discount}:</td><td>-${money(discount, currency)}</td></tr><tr><td>${labels.extraDiscount}:</td><td>${money(0, currency)}</td></tr>` : ""}<tr><td>${labels.beforeTax}:</td><td>${money(net, currency)}</td></tr>${config.showTax !== false ? `<tr><td>${labels.taxTotal}:</td><td>${money(tax, currency)}</td></tr>` : ""}<tr class="grand"><td>${labels.amountDue}:</td><td>${money(paid ? 0 : due, currency)}</td></tr></table></div><footer class="invoice-foot">${config.showSignature !== false || config.showBuyerSignature !== false ? `<div class="signature-grid">${config.showSignature !== false ? sign(labels.billedBy, data.company.signatureUrl) : ""}${config.showSignature !== false ? sign(labels.sentBy) : ""}${config.showSignature !== false ? sign(labels.checkedBy) : ""}${config.showBuyerSignature !== false ? sign(labels.acceptedBy, data.details.buyerSignatureUrl) : ""}</div>` : ""}<div class="company-footer"><div>${config.showBankDetails !== false ? `<strong>${labels.bank}:</strong> ${value(data.company.bankName)}<br/><strong>IBAN:</strong> ${value(data.company.bankIban)}<br/><strong>ID:</strong> ${value(data.company.taxId || data.company.businessId)}` : ""}</div><div>${value(companyAddress)}<br/>${value(data.company.phone)}<br/>${value(data.company.website)}</div><div>${value(data.company.email)}<br/>${value(data.company.website)}<br/>© OperiX Invoice</div></div></footer></article>`;
}

/** Full HTML document used by native print/PDF services. */
export function corporateInvoiceTemplate(data: InvoiceData): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${corporateInvoiceMarkup(data)}</body></html>`;
}
