import type { InvoiceData, TemplateConfig } from "@invoice-monorepo/types";

export const SERVICE_ICON_OPTIONS = [
  { name: "briefcase", labelKey: "serviceIconBusiness" },
  { name: "wrench", labelKey: "serviceIconRepair" },
  { name: "monitor", labelKey: "serviceIconTechnology" },
  { name: "wifi", labelKey: "serviceIconInternet" },
  { name: "camera", labelKey: "serviceIconPhotography" },
  { name: "car", labelKey: "serviceIconTransport" },
  { name: "house", labelKey: "serviceIconHome" },
  { name: "calendar", labelKey: "serviceIconEvent" },
  { name: "globe", labelKey: "serviceIconTravel" },
  { name: "paintbrush", labelKey: "serviceIconDesign" },
  { name: "graduation-cap", labelKey: "serviceIconEducation" },
  { name: "heart-pulse", labelKey: "serviceIconHealth" },
] as const;

export type ServiceIconName = typeof SERVICE_ICON_OPTIONS[number]["name"];

const SERVICE_ICON_PATHS: Record<ServiceIconName, string> = {
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18a2 2 0 0 0 3 3l6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-3-3 3-3Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  wifi: '<path d="M5 13a10 10 0 0 1 14 0M8 16a6 6 0 0 1 8 0M11 19a2 2 0 0 1 2 0M2 9a15 15 0 0 1 20 0"/>',
  camera: '<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  car: '<path d="m5 17-1 3M19 17l1 3M3 17h18l-1.5-7h-15Z"/><path d="M5 10 7 5h10l2 5M3 14h3M18 14h3"/><circle cx="7" cy="17" r="1"/><circle cx="17" cy="17" r="1"/>',
  house: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-6h6v6"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  paintbrush: '<path d="m14 6 4 4M3 21c3.5 0 5-1.5 5-5 0-2.5 1.5-4 4-4l2-2 4 4-2 2c0 2.5-1.5 4-4 4-3.5 0-5 1.5-9 1Z"/>',
  "graduation-cap": '<path d="m2 10 10-5 10 5-10 5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5M22 10v6"/>',
  "heart-pulse": '<path d="M20.8 8.6a5.5 5.5 0 0 0-9-1.7 5.5 5.5 0 0 0-9 1.7C.8 13.7 6.4 18 11.8 21c5.4-3 11-7.3 9-12.4Z"/><path d="M3 12h4l2-3 3 6 2-3h4"/>',
};

export function serviceIconNameFromValue(value?: string | null): ServiceIconName | null {
  if (!value?.startsWith("icon:")) return null;
  const name = value.slice(5) as ServiceIconName;
  return Object.prototype.hasOwnProperty.call(SERVICE_ICON_PATHS, name) ? name : null;
}

export function serviceIconSvg(name: ServiceIconName, color = "#004FFE"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SERVICE_ICON_PATHS[name]}</svg>`;
}

export function serviceIconDataUrl(value?: string | null): string | undefined {
  const name = serviceIconNameFromValue(value);
  return name ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serviceIconSvg(name))}` : value || undefined;
}

const CODE128B_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212",
  "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
  "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

export function code128Barcode(value: unknown): string {
  const text = String(value || '').replace(/[^\x20-\x7E]/g, '').slice(0, 48);
  if (!text) return '';

  const values = Array.from(text, (character) => character.charCodeAt(0) - 32);
  const checksum = (104 + values.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  const symbols = [104, ...values, checksum, 106];
  const quietZone = 10;
  let x = quietZone;
  let bars = '';

  for (const symbol of symbols) {
    const pattern = CODE128B_PATTERNS[symbol];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) bars += `<rect x="${x}" y="0" width="${width}" height="34"/>`;
      x += width;
    }
  }

  return `<svg class="invoice-barcode" viewBox="0 0 ${x + quietZone} 34" role="img" aria-label="Invoice barcode">${bars}</svg>`;
}

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
.operix-invoice { width: 186mm; min-height: 277mm; margin: 0 auto; padding: 0; font-size: 10px; display: flex; flex-direction: column; background: #fff; }
.invoice-header { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: start; padding-bottom: 7px; border-bottom: 1.5px solid #111; }
.invoice-brand { font-size: 30px; line-height: 1.05; font-weight: 800; text-transform: uppercase; letter-spacing: .2px; }
.invoice-brand img { display: block; max-width: 150px; max-height: 34px; margin-bottom: 5px; object-fit: contain; }
.invoice-brand-logo { width: auto; }
.invoice-qr { display: block; width: 28mm; height: 28mm; margin: 0 0 2px auto; object-fit: contain; }
.invoice-balance-secondary-label { display: block; margin-top: 4px; font-size: 8px; font-weight: 600; text-transform: none; color: #4b5563; }
.invoice-type { margin-top: 7px; font-size: 16px; font-weight: 700; text-transform: uppercase; }
.invoice-number { margin-top: 2px; font-size: 15px; font-weight: 800; }
.invoice-barcode { display: block; width: 48mm; max-width: 100%; height: 8mm; margin-top: 3px; shape-rendering: crispEdges; }
.invoice-barcode rect { fill: #111; }
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
.invoice-product-image { display: inline-block; width: 28px; height: 28px; margin-right: 6px; border-radius: 4px; object-fit: cover; vertical-align: middle; }
.invoice-summary { display: grid; grid-template-columns: 1fr 285px; gap: 20px; align-items: start; margin-top: 9px; }
.invoice-note { font-size: 8px; line-height: 1.35; }
.invoice-totals { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #cbd5e1; border-radius: 0; padding: 4px 7px; font-size: 9px; }
.invoice-totals td { padding: 3px 0; }
.invoice-totals td:last-child { text-align: right; white-space: nowrap; }
.invoice-totals .grand td { padding-top: 6px; border-top: 1.5px solid #111; border-bottom: 1.5px solid #111; font-size: 12px; font-weight: 800; }
.invoice-totals .grand td { padding-top: 7px; border-top: 1.5px solid #111; font-weight: 800; }
.paid-stamp { display: none !important; }
.paid-stamp { display: inline-block; margin-top: 8px; padding: 6px 12px; border: 1.5px solid #0b67c2; color: #0b67c2; transform: rotate(-6deg); font-weight: 800; letter-spacing: 1px; }
.paid-stamp small { display: block; margin-top: 2px; font-size: 7px; letter-spacing: 0; text-align: center; }
.invoice-foot { margin-top: auto; padding-top: 9px; }
.signature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 14px; align-items: end; }
.signature-cell { text-align: center; font-size: 8px; }
.signature-line { height: 62px; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid #111; }
.signature-line > img:not(.stamp-overlay) { max-width: 100%; max-height: 58px; object-fit: contain; filter: brightness(0) saturate(100%) invert(26%) sepia(87%) saturate(2046%) hue-rotate(194deg) brightness(87%) contrast(101%); }
.stamped-line { position: relative; }
.stamped-line .stamp-overlay { position: absolute; right: 5%; bottom: -8px; width: 78px; height: 78px; object-fit: contain; opacity: .86; transform: rotate(-10deg); }
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
  .invoice-barcode { width: 48vw; height: 8vw; max-width: 48mm; max-height: 8mm; }
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
    invoice: "Faturë", billTo: "Fatura Për", shipTo: "Malli Për", issue: "Data e faturës", due: "Afati për pagesë", deliveryMethod: "Mënyra e transportit",
    department: "Njësia", reference: "Ref.", yourReference: "Referenti", terms: "Kusht.", number: "Nr.", sku: "Shifra",
    description: "Përshkrimi", quantity: "Sasia", unit: "Njësia", price: "Çmimi pa TVSH", discount: "Rabati", tax: "TVSH %",
    netPrice: "Çmimi me rabat", salePrice: "Çmimi shitës", lineTotal: "Vlera shitëse", beforeDiscount: "Vlera pa rabat", extraDiscount: "Rabati shtesë",
    beforeTax: "Vlera pa TVSH", taxTotal: "TVSH", amountDue: "Totali për pagesë", remaining: "", paid: "",
    billedBy: "Faturoi", sentBy: "Dërgoi", checkedBy: "Kontrolloi", acceptedBy: "Pranoi", fullName: "Emri i plotë", bank: "Banka",
  } : {
    invoice: "Invoice", billTo: "Billed to", shipTo: "Delivered to", issue: "Issue", due: "Due", deliveryMethod: "Delivery method", department: "Unit",
    reference: "Ref.", yourReference: "Your ref.", terms: "Terms", number: "No.", sku: "SKU", description: "Description", quantity: "Qty",
    unit: "Unit", price: "Price excl. VAT", discount: "Discount", tax: "VAT %", netPrice: "Price after discount", salePrice: "Sale price",
    lineTotal: "Line total", beforeDiscount: "Subtotal", extraDiscount: "Additional discount", beforeTax: "Net amount", taxTotal: "VAT", amountDue: "Total to pay",
    remaining: "", paid: "", billedBy: "Prepared by", sentBy: "Sent by", checkedBy: "Checked by", acceptedBy: "Accepted by", fullName: "Full name", bank: "Bank",
  };
  return { ...labels, ...(data.config?.labels || {}) };
};

const value = (input: unknown) => escapeHtml(input || "—");
const percent = (input: number) => {
  const normalized = Number(input) || 0;
  // Discount values can contain calculation noise after persistence. Keep
  // intentional decimals, but render values that are effectively whole.
  if (Math.abs(normalized - Math.round(normalized)) < 0.01) return String(Math.round(normalized));
  return normalized.toFixed(2).replace(/\.00$/, "");
};

export function corporateInvoiceMarkup(data: InvoiceData): string {
  const config: Config = data.config || {};
  const columns = { rowNumber: true, sku: true, description: true, quantity: true, unit: true, unitPrice: true, discount: true, taxRate: true, lineTotal: true, grossPrice: true, ...(config.visibleColumns || {}) };
  const labels = labelsFor(data);
  const items = data.items || [];
  // Current invoice callers pass canonical line totals from calculateInvoice:
  // `total` already includes VAT, while `taxable` and `tax` expose its split.
  // Keep the old calculation as a fallback for older consumers of this
  // package that still pass tax-exclusive line totals only.
  const hasCanonicalLineTotals = items.some((item) => item.taxable !== undefined || item.tax !== undefined);
  const legacySubtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const legacyDiscount = items.reduce((sum, item) => sum + item.quantity * item.price * ((item.discount || 0) / 100), 0);
  const legacyNet = items.reduce((sum, item) => sum + item.total, 0);
  const legacyTax = items.reduce((sum, item) => sum + item.total * ((item.taxRate || 0) / 100), 0);
  const subtotal = hasCanonicalLineTotals ? Number(data.summary.subtotal || 0) : legacySubtotal;
  const discount = hasCanonicalLineTotals ? Number(data.summary.discount || 0) : legacyDiscount;
  const net = hasCanonicalLineTotals ? Math.max(0, Number(data.summary.total || 0) - Number(data.summary.tax || 0)) : legacyNet;
  const tax = hasCanonicalLineTotals ? Number(data.summary.tax || 0) : legacyTax;
  const total = hasCanonicalLineTotals ? Number(data.summary.total || 0) : net + tax;
  const commercialType = String(data.details.commercialDocumentType || '').toUpperCase();
  const protectedDocument = ['QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE'].includes(commercialType);
  const showFiscalIdentifiers = !protectedDocument;
  const received = protectedDocument ? 0 : Number(data.details.amountReceived ?? data.summary.amountReceived ?? 0);
  const due = Math.max(0, total - received);
  const paid = received >= total && total > 0;
  const currency = data.details.currency || "EUR";
  const typeLabels: Record<string, string> = {
    QUOTE: data.details.language === "sq" ? "Ofertë" : "Quote",
    PROFORMA: data.details.language === "sq" || data.details.language === "al" ? "Pro-faturë" : "Proforma",
    SALES_ORDER: data.details.language === "sq" ? "Porosi" : "Sales order",
    DELIVERY_NOTE: data.details.language === "sq" ? "Fletëdërgesë" : "Delivery note",
    INVOICE: labels.invoice,
    ADVANCE_INVOICE: data.details.language === "sq" ? "Faturë Paradhënie" : "Advance invoice",
    FINAL_INVOICE: data.details.language === "sq" ? "Faturë Përfundimtare" : "Final invoice",
    CREDIT_NOTE: data.details.language === "sq" ? "Notë Krediti" : "Credit note",
    DEBIT_NOTE: data.details.language === "sq" ? "Notë Debiti" : "Debit note",
    SIMPLIFIED_INVOICE: data.details.language === "sq" ? "Faturë e Thjeshtuar" : "Simplified invoice",
    FISCAL_RECEIPT: data.details.language === "sq" ? "Kupon Fiskal" : "Fiscal receipt",
    BAD_DEBT_INVOICE: data.details.language === "sq" ? "Faturë për borxh të keq" : "Bad-debt invoice",
  };
  const type = typeLabels[commercialType] || data.details.documentTypeLabel || (data.details.subtype === "offer" || data.details.type === "offer" ? (data.details.language === "sq" ? "Ofertë" : "Offer") : labels.invoice);
  const qrTarget = data.details.qrReference
    ? `https://invoice.operixsuite.com/qr/${encodeURIComponent(data.details.qrReference)}`
    : "";
  const qr = !protectedDocument && config.showQrCode !== false && qrTarget
    ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrTarget)}&color=000000`
    : "";
  const barcode = code128Barcode(data.details.number);
  const value = (input: unknown) => input === data.details.number && barcode
    ? `${escapeHtml(input)}${barcode}`
    : escapeHtml(input || "—");
  const clientAddress = data.client.address || "";
  const deliveryName = data.client.deliveryName || data.client.name;
  const deliveryAddress = data.client.deliveryAddress || clientAddress;
  const deliveryContact = data.client.deliveryContact || data.client.phone || data.client.email;
  const row = (item: InvoiceData["items"][number], index: number) => {
    const taxRate = Number(item.taxRate || 0);
    const discountRate = Number(item.discount || 0);
    const legacyTaxable = item.total;
    const legacyTax = legacyTaxable * taxRate / 100;
    const taxable = Number(item.taxable ?? (hasCanonicalLineTotals ? item.total - Number(item.tax || 0) : legacyTaxable));
    const lineTotal = hasCanonicalLineTotals ? Number(item.total) : taxable + legacyTax;
    const netPrice = item.quantity > 0 ? taxable / item.quantity : item.price * (1 - discountRate / 100);
    const salePrice = item.quantity > 0 ? lineTotal / item.quantity : netPrice * (1 + taxRate / 100);
    const productImageUrl = serviceIconDataUrl(item.imageUrl);
    const productImage = config.showProductPictures && productImageUrl
      ? `<img class="invoice-product-image" src="${safeUrl(productImageUrl)}" alt=""/>`
      : "";
    return `<tr>${columns.rowNumber ? `<td class="number">${index + 1}</td>` : ""}${columns.sku ? `<td>${value(item.sku)}</td>` : ""}${columns.description ? `<td class="description">${productImage}${value(item.description)}</td>` : ""}${columns.quantity ? `<td class="numeric">${item.quantity}</td>` : ""}${columns.unit ? `<td class="center">${value(item.unit || "pcs")}</td>` : ""}${columns.unitPrice ? `<td class="numeric">${money(item.price, currency)}</td>` : ""}${columns.discount ? `<td class="numeric">${percent(discountRate)}%</td>` : ""}${columns.taxRate ? `<td class="numeric">${percent(taxRate)}%</td>` : ""}${columns.grossPrice ? `<td class="numeric">${money(salePrice, currency)}</td>` : ""}${columns.lineTotal ? `<td class="numeric"><strong>${money(lineTotal, currency)}</strong></td>` : ""}</tr>`;
  };
  const header = `${columns.rowNumber ? `<th class="number">${labels.number}</th>` : ""}${columns.sku ? `<th>${labels.sku}</th>` : ""}${columns.description ? `<th class="description">${labels.description}</th>` : ""}${columns.quantity ? `<th>${labels.quantity}</th>` : ""}${columns.unit ? `<th>${labels.unit}</th>` : ""}${columns.unitPrice ? `<th>${labels.price}</th>` : ""}${columns.discount ? `<th>${labels.discount}</th>` : ""}${columns.taxRate ? `<th>${labels.tax}</th>` : ""}${columns.grossPrice ? `<th>${labels.salePrice}</th>` : ""}${columns.lineTotal ? `<th>${labels.lineTotal}</th>` : ""}`;
  const person = (title: string, name: string, address: string, contact: string, taxId = "") => { const albanian = data.details.language === "sq" || data.details.language === "al"; const fields = [[albanian ? "NUI:" : "Tax ID:", showFiscalIdentifiers ? taxId || data.client.taxId : ""], [albanian ? "Kontakt:" : "Contact:", contact], [albanian ? "Adresa:" : "Address:", address]].filter(([, field]) => Boolean(field)); return `<section class="person-block"><div class="person-title">${title}</div><div class="person-name">${value(name)}</div>${fields.length ? `<div class="person-grid">${fields.map(([label, field]) => `<span class="person-label">${label}</span><span>${value(field)}</span>`).join("")}</div>` : ""}</section>`; };
  const sign = (caption: string, image?: string, className = "") => `<div class="signature-cell"><div class="signature-line ${className}">${image ? `<img src="${safeUrl(image)}" alt="${escapeHtml(caption)}"/>` : ""}</div><div class="signature-caption">${caption}</div></div>`;
  // The company stamp is current business identity data, so it must also
  // appear when an older invoice has legacy template settings without it.
  const stamp = data.details.showStampOnInvoice !== false && data.company.stampUrl
    ? `<img class="stamp-overlay" src="${safeUrl(data.company.stampUrl)}" alt="${data.details.language === "sq" || data.details.language === "al" ? "Vula" : "Company stamp"}"/>`
    : "";
  const signWithStamp = (caption: string, image?: string) => `<div class="signature-cell"><div class="signature-line stamped-line">${image ? `<img src="${safeUrl(image)}" alt="${escapeHtml(caption)}"/>` : ""}${stamp}</div><div class="signature-caption">${caption}</div></div>`;
  const companyAddress = [data.company.address, data.company.city, data.company.country].filter(Boolean).join(", ");
  return `<style>${style}</style><article class="operix-invoice"><header class="invoice-header"><div>${config.showLogo !== false && data.company.logoUrl ? `<img class="invoice-brand invoice-brand-logo" src="${safeUrl(data.company.logoUrl)}" alt="${value(data.company.name)}"/>` : `<div class="invoice-brand">${value(data.company.name || "OperiX")}</div>`}<div class="invoice-type">${escapeHtml(type)}: ${value(data.details.number)}</div></div><div class="invoice-balance">${qr ? `<img class="invoice-qr" src="${qr}" alt="Invoice QR code"/>` : ""}<div class="invoice-balance-label">${labels.remaining}</div><div class="invoice-balance-value">${money(paid ? 0 : due, currency)}</div><div class="invoice-status">${paid ? labels.paid : value(data.details.paymentMethod || "—")}</div></div></header><div class="invoice-people">${person(labels.billTo, data.client.name, clientAddress, data.client.email, data.client.taxId || data.client.nui)}${person(labels.shipTo, deliveryName, deliveryAddress, deliveryContact, data.client.vatNumber || data.client.fiscalNumber)}</div><div class="invoice-meta"><div class="meta-cell"><span class="meta-label">${labels.department}</span><span class="meta-value">${value(data.details.department)}</span></div><div class="meta-cell"><span class="meta-label">${labels.issue}</span><span class="meta-value">${date(data.details.issueDate)}</span></div><div class="meta-cell"><span class="meta-label">${labels.due}</span><span class="meta-value">${date(data.details.dueDate)}</span></div>${data.details.deliveryMethod ? `<div class="meta-cell"><span class="meta-label">${labels.deliveryMethod}</span><span class="meta-value">${value(data.details.deliveryMethod)}</span></div>` : ""}<div class="meta-cell"><span class="meta-label">${labels.reference}</span><span class="meta-value">${value(data.details.reference)}</span></div><div class="meta-cell"><span class="meta-label">${labels.yourReference}</span><span class="meta-value">${value(data.details.yourReference)}</span></div><div class="meta-cell"><span class="meta-label">${labels.terms}</span><span class="meta-value">${value(data.details.paymentTerms || "NET 10")}</span></div></div><table class="invoice-items"><thead><tr>${header}</tr></thead><tbody>${items.map(row).join("")}</tbody></table><div class="invoice-summary"><div class="invoice-note">${config.showNotes && (data.details.notes || data.details.terms) ? `<strong>${labels.terms}</strong><br/>${value(data.details.notes || data.details.terms)}` : ""}${paid && config.showStamp !== false ? `<div class="paid-stamp">${labels.paid}<small>${date(new Date().toISOString())}</small></div>` : ""}</div><table class="invoice-totals"><tr><td>${labels.beforeDiscount}:</td><td>${money(subtotal, currency)}</td></tr>${config.showDiscount !== false ? `<tr><td>${labels.discount}:</td><td>-${money(discount, currency)}</td></tr><tr><td>${labels.extraDiscount}:</td><td>${money(0, currency)}</td></tr>` : ""}<tr><td>${labels.beforeTax}:</td><td>${money(net, currency)}</td></tr>${config.showTax !== false ? `<tr><td>${labels.taxTotal}:</td><td>${money(tax, currency)}</td></tr>` : ""}<tr class="grand"><td>${labels.amountDue}:</td><td>${money(paid ? 0 : due, currency)}</td></tr></table></div><footer class="invoice-foot">${config.showSignature !== false || config.showBuyerSignature !== false || stamp ? `<div class="signature-grid">${config.showSignature !== false || stamp ? signWithStamp(labels.billedBy, config.showSignature !== false ? data.company.signatureUrl : undefined) : ""}${config.showSignature !== false ? sign(labels.sentBy) : ""}${config.showSignature !== false ? sign(labels.checkedBy) : ""}${config.showBuyerSignature !== false ? sign(labels.acceptedBy, data.details.buyerSignatureUrl) : ""}</div>` : ""}<div class="company-footer"><div>${config.showBankDetails !== false ? `<strong>${labels.bank}:</strong> ${value(data.company.bankName)}<br/><strong>IBAN:</strong> ${value(data.company.bankIban)}${showFiscalIdentifiers ? `<br/><strong>ID:</strong> ${value(data.company.taxId || data.company.businessId)}` : ""}` : ""}</div><div>${value(companyAddress)}<br/>${value(data.company.phone)}<br/>${value(data.company.website)}</div><div>${value(data.company.email)}<br/>${value(data.company.website)}<br/>© OperiX Invoice</div></div></footer></article>`;
}

/** Full HTML document used by native print/PDF services. */
export function corporateInvoiceTemplate(data: InvoiceData): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${corporateInvoiceMarkup(data)}</body></html>`;
}
