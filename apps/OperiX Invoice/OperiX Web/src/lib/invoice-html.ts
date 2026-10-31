import { invoiceTotals, paymentState } from "./invoice-calculations";
import { appBaseUrl } from "@/lib/app-config";
import type { ClientRow, InvoiceDraft, InvoiceTemplateConfig } from "./models";
import { corporateInvoiceMarkup } from "@invoice-monorepo/invoice-template";
import type { InvoiceData } from "@invoice-monorepo/types";
import { documentTypeLabel, resolveCommercialDocumentType } from "@invoice-monorepo/commercial-documents";

export interface HtmlCompany {
  name?: string; email?: string; phone?: string; address?: string; city?: string;
  country?: string; taxId?: string; businessId?: string; vatNumber?: string; bankName?: string; iban?: string; website?: string;
  logoUrl?: string; signatureUrl?: string; stampUrl?: string;
  bankAccount?: string; bankSwift?: string; primaryColor?: string; isGrayscale?: boolean;
  paymentLinkStripe?: string; paymentLinkPaypal?: string; terms?: string;
  /** Document language: "sq" or "en". */
  language?: string;
}

/** Documents come in two languages only: Albanian and English (older settings saved as Serbian read as Albanian). */
export function documentLanguage(company:HtmlCompany,config?:InvoiceTemplateConfig|null):"sq"|"en"{
  const chosen=String(company.language||"").toLowerCase();
  if(chosen==="sq"||chosen==="al"||chosen==="sr")return "sq";
  if(chosen==="en")return "en";
  const hint=`${config?.labels?.invoice||""} ${config?.labels?.billTo||""}`.toUpperCase();
  return hint.includes("FATUR")?"sq":"en";
}
const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[character]!));
const number=(value:number)=>new Intl.NumberFormat("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
const date=(value:string)=>{if(!value)return "";const parsed=new Date(value);return `${String(parsed.getDate()).padStart(2,"0")}/${String(parsed.getMonth()+1).padStart(2,"0")}/${parsed.getFullYear()}`;};

const receiptStyle=`@page{size:50mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:50mm;background:#fff;color:#000}body{padding:3mm 3mm 5mm;font-family:"Courier New",Courier,monospace;font-size:10px;line-height:1.25}.center{text-align:center}.right{text-align:right}.bold{font-weight:700}.company{font-size:15px;font-weight:700;margin-bottom:2px}.small{font-size:9px}.meta{width:100%;margin:7px 0 4px;border-collapse:collapse}.meta td{padding:1px 0;vertical-align:top}.meta td:first-child{width:17mm;font-weight:700}.rule{border-top:1px dashed #000;margin:5px 0}.section-title{text-align:center;font-weight:700;margin:5px 0}.items{width:100%;border-collapse:collapse;table-layout:fixed}.items th{border-bottom:1px solid #000;padding:2px 1px;text-align:right;font-size:9px}.items th:first-child{text-align:left}.items td{padding:2px 1px;text-align:right;vertical-align:top;overflow-wrap:anywhere}.items td:first-child{text-align:left}.description{width:34%}.quantity{width:18%}.price,.value{width:24%}.totals{width:100%;border-collapse:collapse;margin-top:3px}.totals td{padding:2px 0}.totals td:last-child{text-align:right;font-weight:700}.grand-total td{border-top:1px solid #000;border-bottom:1px solid #000;font-size:13px;padding:4px 0}.payment{margin-top:6px}.footer{margin-top:9px;text-align:center;font-size:9px}`;

const RECEIPT_TEXT={
  sq:{business:"BIZNESI",fiscalId:"NUI/NR. FISKAL",document:"Dokumenti:",number:"Nr:",date:"Data:",client:"Klienti:",vat:"TVSH:",summary:"<< PËRMBLEDHJE E DOKUMENTIT >>",description:"Përshkrim",quantity:"Sasi",price:"Çmim",value:"Vlera",subtotal:"Nëntotali:",discount:"Zbritja:",total:"TOTALI:",payment:"Pagesa:",received:"Pranuar:",change:"Kusuri:",thanks:"JU FALEMINDERIT!",methods:{cash:"Para të gatshme",bank:"Transfer bankar",card:"Kartelë / POS",online_payment:"Pagesë online",cheque:"Çek",other:"Tjetër",customer_credit:"Borxh"} as Record<string,string>},
  en:{business:"BUSINESS",fiscalId:"TAX ID / FISCAL NO.",document:"Document:",number:"No:",date:"Date:",client:"Customer:",vat:"VAT:",summary:"<< DOCUMENT SUMMARY >>",description:"Description",quantity:"Qty",price:"Price",value:"Amount",subtotal:"Subtotal:",discount:"Discount:",total:"TOTAL:",payment:"Payment:",received:"Received:",change:"Change:",thanks:"THANK YOU!",methods:{cash:"Cash",bank:"Bank transfer",card:"Card / POS",online_payment:"Online payment",cheque:"Cheque",other:"Other",customer_credit:"On account"} as Record<string,string>},
};

function receiptMarkup(draft:InvoiceDraft,client:ClientRow|undefined,company:HtmlCompany,language:"sq"|"en"="en"){
  const L=RECEIPT_TEXT[language];
  const totals=invoiceTotals(draft);
  const payment=paymentState(totals.total,draft.amount_received);
  const documentType=draft.commercial_document_type||resolveCommercialDocumentType(draft as unknown as Record<string,unknown>);
  const hidesFiscalIdentifiers=documentType!=="INVOICE"&&documentType!=="FINAL_INVOICE"&&documentType!=="SIMPLIFIED_INVOICE"&&documentType!=="FISCAL_RECEIPT";
  const currency=draft.currency||"EUR";
  const rows=draft.items.map((item,index)=>`<tr><td>${esc(item.description)}${item.sku?`<div class="small">${esc(item.sku)}</div>`:""}</td><td>${number(item.quantity)}</td><td>${number(item.unit_price)}</td><td>${number(totals.lines[index]?.total || 0)}</td></tr>`).join("");
  return `<style>${receiptStyle}</style><header class="center"><div class="company">${esc(company.name||L.business)}</div>${company.address?`<div class="small">${esc(company.address)}</div>`:""}${company.phone?`<div class="small">Tel: ${esc(company.phone)}</div>`:""}${!hidesFiscalIdentifiers&&company.taxId?`<div class="small">${L.fiscalId}: ${esc(company.taxId)}</div>`:""}</header><table class="meta"><tr><td>${L.document}</td><td>${esc(documentTypeLabel(documentType,language))}</td></tr><tr><td>${L.number}</td><td>${esc(draft.invoice_number)}</td></tr><tr><td>${L.date}</td><td>${date(draft.issue_date)}</td></tr><tr><td>${L.client}</td><td>${esc(client?.name||"-")}</td></tr><tr><td>${L.vat}</td><td>${number(totals.tax)} ${esc(currency)}</td></tr></table><div class="rule"></div><div class="section-title">${esc(L.summary)}</div><table class="items"><thead><tr><th class="description">${L.description}</th><th class="quantity">${L.quantity}</th><th class="price">${L.price}</th><th class="value">${L.value}</th></tr></thead><tbody>${rows}</tbody></table><table class="totals"><tr><td>${L.subtotal}</td><td>${number(totals.subtotal)} ${esc(currency)}</td></tr>${totals.discount>0?`<tr><td>${L.discount}</td><td>-${number(totals.discount)} ${esc(currency)}</td></tr>`:""}<tr><td>${L.vat}</td><td>${number(totals.tax)} ${esc(currency)}</td></tr><tr class="grand-total"><td>${L.total}</td><td>${number(totals.total)} ${esc(currency)}</td></tr></table>${draft.payment_method?`<div class="payment"><span class="bold">${L.payment}</span> ${esc(L.methods[String(draft.payment_method)]||draft.payment_method)}</div>`:""}${Number(draft.amount_received)>0?`<table class="totals"><tr><td>${L.received}</td><td>${number(draft.amount_received)} ${esc(currency)}</td></tr><tr><td>${L.change}</td><td>${number(payment.change)} ${esc(currency)}</td></tr></table>`:""}<div class="footer"><div class="rule"></div><div class="bold">${L.thanks}</div>${company.email?`<div>${esc(company.email)}</div>`:""}${company.website?`<div>${esc(company.website)}</div>`:""}</div>`;
}

/** The payment type as the mobile app words it. */
function paymentTypeLabel(value: unknown, language: "sq" | "en") {
  const sq = language === "sq";
  const labels: Record<string, string> = { cash: sq ? "Para në dorë" : "Cash", bank: sq ? "Transfertë bankare" : "Bank transfer", card: sq ? "Kartelë" : "Card", online_payment: sq ? "Pagesë online" : "Online payment", cheque: sq ? "Çek" : "Cheque", other: sq ? "Tjetër" : "Other", customer_credit: sq ? "Borxh" : "Debt" };
  return labels[String(value || "").toLowerCase()] || String(value || "");
}

function sharedCorporateMarkup(draft: InvoiceDraft, client: ClientRow | undefined, company: HtmlCompany, config: InvoiceTemplateConfig): string {
  const totals = invoiceTotals(draft);
  const language = documentLanguage(company, config);
  const commercialDocumentType = draft.commercial_document_type || resolveCommercialDocumentType({ type: draft.status === "sent" ? "invoice" : undefined });
  const fiscalIdentifiersHidden = commercialDocumentType === "PROFORMA" || commercialDocumentType === "QUOTE" || commercialDocumentType === "SALES_ORDER" || commercialDocumentType === "DELIVERY_NOTE";
  const showSignature = draft.show_signature ?? config.showSignature ?? true;
  const showStamp = draft.show_stamp ?? config.showStamp ?? true;
  const showProductPictures = draft.show_product_pictures ?? config.showProductPictures ?? false;
  const data: InvoiceData = {
    company: { name: company.name || "OperiX", address: company.address || "", city: company.city, country: company.country, email: company.email, phone: company.phone, website: company.website, taxId: company.taxId, businessId: company.businessId, vatNumber: company.vatNumber, logoUrl: company.logoUrl, signatureUrl: company.signatureUrl, stampUrl: company.stampUrl, bankName: company.bankName, bankIban: company.iban, bankAccount: company.bankAccount, bankSwift: company.bankSwift, primaryColor: company.primaryColor || config.primaryColor, isGrayscale: company.isGrayscale, paymentLinkStripe: company.paymentLinkStripe, paymentLinkPaypal: company.paymentLinkPaypal },
    client: { name: client?.name || "—", address: [client?.address, client?.city, client?.zip_code, client?.country].filter(Boolean).join(", "), email: client?.email || "", phone: client?.phone, taxId: client?.tax_id, nui: client?.nui, fiscalNumber: client?.fiscal_number, vatNumber: client?.vat_number },
    details: { number: draft.invoice_number, qrBaseUrl: appBaseUrl() || undefined, issueDate: draft.issue_date, dueDate: draft.due_date, currency: draft.currency || "EUR", language, notes: draft.notes, paymentMethod: draft.payment_method, status: draft.status, amountReceived: draft.amount_received, type: commercialDocumentType === "QUOTE" || commercialDocumentType === "SALES_ORDER" ? "offer" : "invoice", subtype: commercialDocumentType.toLowerCase(), commercialDocumentType, documentTypeLabel: documentTypeLabel(commercialDocumentType, language === "sq" ? "sq" : "en"), buyerSignatureUrl: draft.buyer_signature_url || undefined, qrReference: draft.qrReference, deliveryMethod: draft.delivery_method ? `${draft.delivery_method}${draft.delivery_details ? ` — ${draft.delivery_details}` : ""}` : undefined, deliveryDetails: draft.delivery_details, showStampOnInvoice: showStamp, showProductPictures, terms: company.terms || undefined, department: draft.branch_name || company.name || "", agent: draft.agent_name || "", reference: draft.agent_name || "", yourReference: paymentTypeLabel(draft.payment_method, language), paymentStatus: draft.payment_status, changeAmount: draft.change_amount },
    items: draft.items.map((item, index) => ({ description: item.description, quantity: item.quantity, price: item.unit_price, total: totals.lines[index]?.total ?? 0, taxable: totals.lines[index]?.taxable ?? 0, tax: totals.lines[index]?.tax ?? 0, taxIncluded: Boolean(item.tax_included), unit: item.unit, sku: item.sku, discount: item.discount, taxRate: item.tax_rate, imageUrl: item.image_url })),
    summary: { subtotal: totals.subtotal, tax: totals.tax, discount: totals.discount, total: totals.total, amountReceived: draft.amount_received, changeAmount: draft.change_amount, discountPercent: draft.discount_percent || 0 },
    config: { showLogo: config.showLogo ?? true, showSignature, showBuyerSignature: config.showBuyerSignature ?? true, showStamp, showProductPictures, showQrCode: !fiscalIdentifiersHidden && (config.showQrCode ?? true), showNotes: config.showNotes ?? true, showDiscount: config.showDiscount ?? true, showTax: config.showTax ?? true, showBankDetails: config.showBankDetails ?? true, visibleColumns: { rowNumber: true, sku: true, description: true, quantity: true, unit: true, unitPrice: true, discount: true, taxRate: true, lineTotal: true, grossPrice: true, ...config.visibleColumns }, labels: { ...(config.labels || {}), department: language === "sq" ? "Dega" : "Branch", reference: language === "sq" ? "Agjenti" : "Agent", yourReference: language === "sq" ? "Lloji i pagesës" : "Payment type" }, pageSize: (draft.paper_size as "A4" | "A5" | "Receipt" | undefined) || config.pageSize || "A4" },
  };
  return corporateInvoiceMarkup(data);
}

export function invoiceMarkup(draft:InvoiceDraft,client?:ClientRow,receipt=false,company:HtmlCompany={},config?:InvoiceTemplateConfig | null){const safeConfig=config||{};return receipt?receiptMarkup(draft,client,company,documentLanguage(company,config)):sharedCorporateMarkup(draft,client,company,safeConfig);}
export function invoiceHtml(draft:InvoiceDraft,client?:ClientRow,receipt=false,company:HtmlCompany={},config?:InvoiceTemplateConfig | null){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${invoiceMarkup(draft,client,receipt,company,config)}</body></html>`;}
