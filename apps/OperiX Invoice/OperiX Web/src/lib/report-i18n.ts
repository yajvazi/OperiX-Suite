import type { UiLanguage } from "@/lib/i18n/language";

const SQ: Record<string, string> = {
  "Reports & taxes": "Raportet dhe tatimet",
  "Financial statements, books and tax records from your posted accounting entries.": "Pasqyrat financiare, librat dhe regjistrat tatimorë nga regjistrimet e postuara kontabël.",
  "Summary and statements from the records stored in this browser.": "Përmbledhja dhe pasqyrat nga të dhënat e ruajtura në këtë shfletues.",
  "Financial statements": "Pasqyrat financiare",
  "Taxes & compliance": "Tatimet dhe pajtueshmëria",
  "Tax books and declaration previews stay linked to posted source data. Electronic submission is not part of this page.": "Librat tatimorë dhe pamjet paraprake të deklarimeve mbeten të lidhura me të dhënat e postuara. Dorëzimi elektronik nuk është pjesë e kësaj faqeje.",
  "Search reports…": "Kërko raporte…",
  "No report matches your search.": "Asnjë raport nuk përputhet me kërkimin.",
  "Revenue": "Të ardhurat",
  "Expenses": "Shpenzimet",
  "Net profit": "Fitimi neto",
  "Receivables": "Arkëtimet",
  "Payables": "Pagesat",
  "Payroll": "Pagat",
  "Payroll and statutory controls.": "Pagat dhe kontrollet ligjore.",
  "Control status": "Statusi i kontrollit",
  "All reconciliation checks pass": "Të gjitha kontrollet e rakordimit kalojnë",
  "Reconciliation requires attention": "Rakordimi kërkon vëmendje",
  "A report is only trustworthy when its accounting controls reconcile.": "Një raport është i besueshëm vetëm kur kontrollet kontabël rakordohen.",
  "Reports & taxes —": "Raportet dhe tatimet —",
  "All reports": "Të gjitha raportet",
  "Rows": "Rreshta",
  "Total": "Totali",
  "From": "Nga",
  "To": "Deri",
  "Search this report…": "Kërko në këtë raport…",
  "Clear filters": "Pastro filtrat",
  "CSV": "CSV",
  "Preview / PDF": "Pamje / PDF",
  "Reading posted accounting…": "Po lexohen regjistrimet e postuara…",
  "No posted records.": "Nuk ka regjistrime të postuara.",
  "No rows match the filters.": "Asnjë rresht nuk përputhet me filtrat.",
  "Loading…": "Po ngarkohet…",
  "Showing the first": "Po shfaqen të parët",
  "rows. CSV and PDF include all": "rreshta. CSV dhe PDF përfshijnë të gjithë:",
  "Click a row to see all its details.": "Klikoni një rresht për të parë të gjitha detajet.",
  "Details": "Detajet",
  "You do not have permission to view this report.": "Nuk keni leje për ta parë këtë raport.",
  "This report does not exist.": "Ky raport nuk ekziston.",
  "This report needs cloud storage.": "Ky raport kërkon ruajtje në cloud.",
  "The report could not be loaded.": "Raporti nuk u ngarkua.",
  "Allow pop-ups to open the PDF preview.": "Lejoni dritaret pop-up për të hapur pamjen e PDF-së.",
  "Open": "Hap",
  "rows": "rreshta",
  "Sort": "Rendit",
  "Prepared": "Përgatitur",
  "Retry": "Provo përsëri",
};

export function rt(lang: UiLanguage, text: string) {
  return lang === "sq" ? SQ[text] ?? text : text;
}

const COLUMN_SQ: Record<string, string> = {
  tenant_name: "Kompania", company: "Kompania", invoice_number: "Nr. i faturës", bill_number: "Nr. i faturës së furnitorit", entry_number: "Nr. i regjistrimit",
  line_number: "Nr. i rreshtit", account_name: "Emri i llogarisë", account_code: "Kodi i llogarisë", account_type: "Lloji i llogarisë", name: "Emri", asset_number: "Nr. i aktivit",
  supplier_name: "Furnitori", customer_name: "Klienti", client_name: "Klienti", declaration_type: "Lloji i deklaratës", title: "Titulli", file_name: "Emri i skedarit", sku: "Kodi",
  description: "Përshkrimi", tax_type: "Lloji i tatimit", posting_date: "Data e postimit", document_date: "Data e dokumentit", issue_date: "Data e lëshimit", invoice_date: "Data e faturës",
  bill_date: "Data e faturës së furnitorit", payment_date: "Data e pagesës", acquisition_date: "Data e blerjes", period_start: "Fillimi i periudhës", period_end: "Fundi i periudhës",
  due_date: "Afati i pagesës", status: "Statusi", total_amount: "Shuma totale", net_amount: "Shuma pa TVSH", taxable_amount: "Baza e tatueshme", taxable_base: "Baza e tatueshme",
  output_vat: "TVSH në dalje", input_vat: "TVSH në hyrje", recoverable_vat: "TVSH e zbritshme", vat_amount: "Shuma e TVSH-së", withheld_amount: "Shuma e mbajtur në burim",
  tax_rate: "Norma tatimore", tax_base: "Baza tatimore", total_vat: "TVSH gjithsej", vat_total: "TVSH gjithsej", obligation_type: "Lloji i detyrimit", obligation_status: "Statusi i detyrimit",
  amount: "Shuma", currency: "Monedha", notes: "Shënime", declaration_status: "Statusi i deklarimit", declaration_number: "Nr. i deklarimit", category: "Kategoria", source: "Burimi",
  created_at: "Krijuar më", updated_at: "Përditësuar më", presentation_amount: "Shuma", balance: "Bilanci", outstanding_amount: "Shuma e papaguar", debit: "Debi", credit: "Kredi",
  total_debit: "Debia gjithsej", total_credit: "Krediti gjithsej", signed_amount: "Shuma me shenjë", net_change: "Ndryshimi neto", change_amount: "Shuma e ndryshimit",
  cash_account_type: "Lloji i llogarisë së arkës", acquisition_cost: "Kostoja e blerjes", inventory_value: "Vlera e inventarit", quantity: "Sasia", unit_cost: "Kosto për njësi",
  aging_bucket: "Grupi i vjetërsimit", days_overdue: "Ditë vonesë", byte_size: "Madhësia (bajt)", document_type: "Lloji i dokumentit", reference: "Referenca", memo: "Memo",
};

export function columnLabel(lang: UiLanguage, column: string) {
  if (lang === "sq" && COLUMN_SQ[column]) return COLUMN_SQ[column];
  return column.replace(/^tenant_name$/, "company").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export const MONEY_COLUMN = /(amount|balance|debit|credit|total|vat|cost|value|net_change|presentation|price|base)/i;
export const DATE_COLUMN = /(date|period_start|period_end|created_at|updated_at)$/i;
