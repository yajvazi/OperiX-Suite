import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { code128Barcode } from '@invoice-monorepo/invoice-template';
import { formatCurrency, t, type AppLocale } from '@invoice-monorepo/i18n';
import { namePdfFile } from './fileNaming';
import { formatPdfDate } from './dateFormatting';

export type TransactionPdfInput = {
    title: string;
    fileName?: string;
    number?: string;
    amount: number;
    date: string;
    description?: string;
    notes?: string;
    category?: string;
    method?: string;
    counterparty?: string;
    reference?: string;
    currency?: string;
    language?: AppLocale;
    transactionType?: 'payment' | 'expense' | 'income';
    counterpartyType?: 'customer' | 'vendor';
    counterpartyEmail?: string;
    counterpartyPhone?: string;
    counterpartyAddress?: string;
    documentStatusLabel?: string;
    relatedDocumentNumber?: string;
    relatedDocumentLabel?: string;
    barcodeValue?: string;
    company?: {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        country?: string;
        website?: string;
        taxId?: string;
        bankName?: string;
        iban?: string;
        logoUrl?: string;
        primaryColor?: string;
        signatureUrl?: string;
        stampUrl?: string;
        showSignature?: boolean;
        showStamp?: boolean;
    };
    clientSignatureUrl?: string;
    showClientSignature?: boolean;
};

const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function generateTransactionPdfHtml(data: TransactionPdfInput): string {
    const language = data.language || 'en';
    const company = data.company || {};
    const primaryColor = /^#[0-9a-f]{6}$/i.test(company.primaryColor || '') ? company.primaryColor! : '#004FFE';
    const transactionType = data.transactionType || (data.counterpartyType ? 'payment' : 'expense');
    const isPayment = transactionType === 'payment' || Boolean(data.counterpartyType);
    const methodLabel = data.method === 'cash'
        ? t('cash', language)
        : data.method === 'bank'
            ? t('bankTransfer', language)
            : data.method === 'card'
                ? t('card', language)
                : data.method || (transactionType === 'expense' ? t('expense', language) : transactionType === 'income' ? t('income', language) : undefined);
    const counterpartyLabel = data.counterpartyType === 'vendor' ? t('vendor', language) : t('customer', language);
    const amountLabel = formatCurrency(data.amount, data.currency || 'EUR', language);
    const displayDate = formatPdfDate(data.date);
    const relatedDocumentLabel = data.relatedDocumentLabel || (data.counterpartyType === 'vendor' ? t('supplierBill', language) : t('invoice', language));
    const companyAddress = [company.address, company.city, company.country].filter(Boolean).join(', ');
    const barcode = code128Barcode(data.barcodeValue || (data.number ? `PAYMENT:${data.number}` : ''));
    const amountText = isPayment ? t('paymentAmount', language) : t('amount', language);
    const partyCell = data.counterparty
        ? `<div class="info-cell"><div class="label">${escapeHtml(counterpartyLabel)}</div><div class="value">${escapeHtml(data.counterparty)}</div></div>`
        : data.category
            ? `<div class="info-cell"><div class="label">${escapeHtml(t('category', language))}</div><div class="value">${escapeHtml(data.category)}</div></div>`
            : '<div class="info-cell"><div class="label">&nbsp;</div><div class="value">—</div></div>';
    const categoryCell = data.category && data.counterparty
        ? `<div class="info-cell"><div class="label">${escapeHtml(t('category', language))}</div><div class="value">${escapeHtml(data.category)}</div></div>`
        : '';
    const counterpartyInfoCells = data.counterparty
        ? `${data.counterpartyEmail ? `<div class="info-cell"><div class="label">Email</div><div class="value">${escapeHtml(data.counterpartyEmail)}</div></div>` : ''}${data.counterpartyPhone ? `<div class="info-cell"><div class="label">${escapeHtml(t('phone', language))}</div><div class="value">${escapeHtml(data.counterpartyPhone)}</div></div>` : ''}${data.counterpartyAddress ? `<div class="info-cell"><div class="label">${escapeHtml(t('address', language))}</div><div class="value">${escapeHtml(data.counterpartyAddress)}</div></div>` : ''}`
        : '';
    const documentStatusLabel = data.documentStatusLabel || (isPayment ? t('paymentReceipt', language) : data.title);
    const identity = `${company.logoUrl ? `<img class="logo" src="${escapeHtml(company.logoUrl)}" alt="${escapeHtml(company.name || 'Tenant')}"/>` : `<div class="company-name">${escapeHtml(company.name || '—')}</div>`}${barcode}`;
    const signatureMarkup = company.showSignature !== false && company.signatureUrl
        ? `<div class="signature-block"><div class="signature-asset"><img src="${escapeHtml(company.signatureUrl)}" alt="${escapeHtml(t('signature', language))}"/></div><div class="signature-line"></div><div class="signature-label">${escapeHtml(t('signature', language))}</div></div>`
        : '';
    const stampMarkup = company.showStamp !== false && company.stampUrl
        ? `<div class="signature-block"><div class="stamp-asset"><img src="${escapeHtml(company.stampUrl)}" alt="${escapeHtml(t('officialStamp', language))}"/></div><div class="signature-label">${escapeHtml(t('officialStamp', language))}</div></div>`
        : '';
    const clientSignatureMarkup = data.showClientSignature !== false && (data.counterpartyType === 'customer' || data.showClientSignature === true)
        ? `<div class="signature-block"><div class="signature-asset">${data.clientSignatureUrl ? `<img src="${escapeHtml(data.clientSignatureUrl)}" alt="${escapeHtml(t('clientSignature', language))}"/>` : ''}</div><div class="signature-line"></div><div class="signature-label">${escapeHtml(t('clientSignature', language))}</div></div>`
        : '';
    const signaturesMarkup = signatureMarkup || stampMarkup || clientSignatureMarkup
        ? `<section class="signatures">${signatureMarkup}${stampMarkup}${clientSignatureMarkup}</section>`
        : '';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=794, initial-scale=1"><style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #fff; }
      .page { width: 186mm; min-height: 277mm; margin: 0 auto; padding: 11mm 0 9mm; display: flex; flex-direction: column; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:10px; border-bottom:1.5px solid #111827; }
      .logo { display:block; max-width:150px; max-height:36px; object-fit:contain; margin-bottom:5px; }
      .company-name { font-size:28px; line-height:1.05; font-weight:800; letter-spacing:.2px; text-transform:uppercase; }
      .company-name-with-logo { font-size:14px; letter-spacing:.1px; }
      .invoice-barcode { display:block; width:48mm; max-width:100%; height:8mm; margin-top:5px; shape-rendering:crispEdges; }
      .invoice-barcode rect { fill:#111827; }
      .document-head { text-align:right; min-width:150px; }
      .document-label { color:#667085; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; }
      .document-number { margin-top:4px; font-size:16px; font-weight:800; }
      .document-status { display:inline-block; margin-top:8px; padding:4px 9px; border:1px solid ${primaryColor}; border-radius:3px; color:${primaryColor}; font-size:8px; font-weight:700; text-transform:uppercase; }
      .title { margin:16px 0 10px; font-size:18px; font-weight:800; }
      .payment-hero { display:flex; justify-content:space-between; align-items:center; padding:15px 17px; border-radius:4px; background:${primaryColor}; color:#fff; }
      .hero-label { font-size:9px; opacity:.8; text-transform:uppercase; letter-spacing:.7px; }
      .hero-value { margin-top:4px; font-size:26px; font-weight:800; }
      .hero-method { text-align:right; font-size:12px; font-weight:700; }
      .info-grid { display:grid; grid-template-columns:repeat(3, 1fr); margin-top:12px; border:1px solid #98A2B3; }
      .info-cell { min-height:49px; padding:8px 9px; border-right:1px solid #98A2B3; }
      .info-cell:nth-child(3n) { border-right:0; }
      .info-cell:nth-child(n+4) { border-top:1px solid #98A2B3; }
      .label { color:#667085; font-size:8px; font-weight:700; text-transform:uppercase; }
      .value { margin-top:4px; font-size:10px; font-weight:700; overflow-wrap:anywhere; }
      .details { margin-top:12px; border:1px solid #CBD5E1; padding:11px 12px; }
      .details-title { margin-bottom:7px; font-size:10px; font-weight:800; text-transform:uppercase; }
      .details-row { display:flex; gap:12px; padding:5px 0; border-bottom:1px solid #E6EBF1; font-size:10px; }
      .details-row:last-child { border-bottom:0; }
      .details-label { width:34%; color:#667085; }
      .details-value { flex:1; font-weight:600; white-space:pre-wrap; }
      .summary { width:44%; margin:13px 0 0 auto; border:1px solid #CBD5E1; padding:8px 10px; }
      .summary-row { display:flex; justify-content:space-between; gap:12px; padding:4px 0; font-size:10px; }
      .summary-row.grand { margin-top:5px; padding:8px 0 4px; border-top:1.5px solid #111827; font-size:14px; font-weight:800; }
      .signatures { margin-top:auto; margin-bottom:16px; display:flex; justify-content:center; align-items:flex-end; gap:18px; page-break-inside:avoid; }
      .signature-block { width:30%; min-width:92px; text-align:center; font-size:8px; color:#667085; }
      .signature-asset { height:71px; display:flex; align-items:flex-end; justify-content:center; }
      .signature-asset img { max-width:100%; max-height:68px; object-fit:contain; }
      .signature-line { border-top:1px solid #172033; margin-top:5px; }
      .signature-label { margin-top:5px; line-height:1.2; }
      .stamp-asset { height:80px; display:flex; align-items:center; justify-content:center; }
      .stamp-asset img { max-width:82px; max-height:80px; object-fit:contain; }
      .footer { padding-top:8px; border-top:1px solid #111827; display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; color:#667085; font-size:8px; line-height:1.4; }
      .footer-center { text-align:center; }.footer-right { text-align:right; }
      @media print { .page { min-height:277mm; } }
    </style></head><body>
      <main class="page">
        <header class="header"><div>${identity}</div><div class="document-head"><div class="document-label">${escapeHtml(data.title)}</div><div class="document-number">${escapeHtml(data.number || '—')}</div><div class="document-status">${escapeHtml(documentStatusLabel)}</div></div></header>
        <div class="title">${escapeHtml(data.title)}</div>
        <section class="payment-hero"><div><div class="hero-label">${escapeHtml(amountText)}</div><div class="hero-value">${escapeHtml(amountLabel)}</div></div><div class="hero-method">${escapeHtml(methodLabel || '—')}</div></section>
        <section class="info-grid"><div class="info-cell"><div class="label">${escapeHtml(t('dateLabel', language))}</div><div class="value">${escapeHtml(displayDate)}</div></div>${partyCell}<div class="info-cell"><div class="label">${escapeHtml(t('paymentMethod', language))}</div><div class="value">${escapeHtml(methodLabel || data.method || '—')}</div></div>${data.relatedDocumentNumber ? `<div class="info-cell"><div class="label">${escapeHtml(relatedDocumentLabel)}</div><div class="value">${escapeHtml(data.relatedDocumentNumber)}</div></div>` : ''}${data.reference ? `<div class="info-cell"><div class="label">${escapeHtml(t('bankReference', language))}</div><div class="value">${escapeHtml(data.reference)}</div></div>` : ''}${counterpartyInfoCells}${categoryCell}</section>
        ${data.description || data.notes ? `<section class="details"><div class="details-title">${escapeHtml(t('paymentDetails', language))}</div>${data.description ? `<div class="details-row"><div class="details-label">${escapeHtml(t('description', language))}</div><div class="details-value">${escapeHtml(data.description)}</div></div>` : ''}${data.notes ? `<div class="details-row"><div class="details-label">${escapeHtml(t('notes', language))}</div><div class="details-value">${escapeHtml(data.notes)}</div></div>` : ''}</section>` : ''}
        <section class="summary"><div class="summary-row"><span>${escapeHtml(amountText)}</span><b>${escapeHtml(amountLabel)}</b></div><div class="summary-row grand"><span>${escapeHtml(t('total', language))}</span><span>${escapeHtml(amountLabel)}</span></div></section>
        ${signaturesMarkup}
        <footer class="footer"><div><b>${escapeHtml(t('bank', language))}:</b> ${escapeHtml(company.bankName || '—')}<br><b>IBAN:</b> ${escapeHtml(company.iban || '—')}${company.taxId ? `<br><b>ID:</b> ${escapeHtml(company.taxId)}` : ''}</div><div class="footer-center">${escapeHtml(companyAddress)}<br>${escapeHtml(company.phone || '')}</div><div class="footer-right">${escapeHtml(company.email || '')}<br>${escapeHtml(company.website || '')}<br>${escapeHtml(t('generatedByOperix', language))}</div></footer>
      </main>
    </body></html>`;
}

export async function generateTransactionPdf(data: TransactionPdfInput): Promise<string> {
    const html = generateTransactionPdfHtml(data);
    const { uri } = await Print.printToFileAsync({ html, base64: false, width: 595, height: 842, margins: { top: 0, right: 0, bottom: 0, left: 0 } });
    return namePdfFile(uri, data.fileName);
}

let transactionPrintBusy = false;

export async function printTransactionPdf(data: TransactionPdfInput): Promise<{ success: boolean; canceled?: boolean }> {
    if (transactionPrintBusy) return { success: false, canceled: true };
    transactionPrintBusy = true;
    try {
        const uri = await generateTransactionPdf(data);
        await Print.printAsync({ uri });
        return { success: true };
    } catch (error: any) {
        const canceled = /cancelled|another print request is already in progress|printing did not complete/i.test(String(error?.message || error));
        if (!canceled) {
            console.error('Transaction print error:', error);
        }
        return { success: false, canceled };
    } finally {
        transactionPrintBusy = false;
    }
}

export async function shareTransactionPdf(data: TransactionPdfInput): Promise<void> {
    const uri = await generateTransactionPdf(data);
    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: data.title, UTI: 'com.adobe.pdf' });
    }
}
