import { InvoiceData } from '@invoice-monorepo/types';
import { pdfTranslations } from '../translations';

export function getThermalPageHeight(itemCount: number): number {
  // Height in PDF points. Thermal rolls have a fixed width but variable length.
  return Math.max(430, 360 + itemCount * 34);
}

export function receiptTemplate(data: InvoiceData): string {
  const { company, client, details, items, summary } = data;
  const lang = details.language || 'en';
  const labels = { ...pdfTranslations.en, ...(pdfTranslations[lang] || {}) };
  const currency = details.currency || 'EUR';
  const pageHeightPoints = getThermalPageHeight(items.length);
  const pageHeightMm = Math.ceil((pageHeightPoints / 72) * 25.4);

  const number = (value: number) => new Intl.NumberFormat(lang === 'sq' ? 'sq-AL' : 'de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

  const paymentLabels: Record<string, string> = {
    cash: labels.cash,
    bank: labels.bankTransfer,
    card: labels.card,
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { size: 50mm ${pageHeightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 50mm; background: #fff; color: #000; }
    body {
      padding: 3mm 3mm 5mm;
      font-family: "Courier New", Courier, monospace;
      font-size: 10px;
      line-height: 1.25;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .company { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
    .company-logo { display: block; max-width: 38mm; max-height: 16mm; margin: 0 auto 2px; object-fit: contain; }
    .small { font-size: 9px; }
    .meta { width: 100%; margin: 7px 0 4px; border-collapse: collapse; }
    .meta td { padding: 1px 0; vertical-align: top; }
    .meta td:first-child { width: 17mm; font-weight: 700; }
    .rule { border-top: 1px dashed #000; margin: 5px 0; }
    .section-title { text-align: center; font-weight: 700; margin: 5px 0; }
    .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .items th { border-bottom: 1px solid #000; padding: 2px 1px; text-align: right; font-size: 9px; }
    .items th:first-child { text-align: left; }
    .items td { padding: 2px 1px; text-align: right; vertical-align: top; overflow-wrap: anywhere; }
    .items td:first-child { text-align: left; }
    .description { width: 34%; }
    .quantity { width: 18%; }
    .price, .value { width: 24%; }
    .totals { width: 100%; border-collapse: collapse; margin-top: 3px; }
    .totals td { padding: 2px 0; }
    .totals td:last-child { text-align: right; font-weight: 700; }
    .grand-total td { border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 13px; padding: 4px 0; }
    .payment { margin-top: 6px; }
    .footer { margin-top: 9px; text-align: center; font-size: 9px; }
  </style>
</head>
<body>
  <header class="center">
    ${company.logoUrl ? `<img class="company-logo" src="${company.logoUrl}" alt="Logo">` : `<div class="company">${company.name || labels.business}</div>`}
    ${company.address ? `<div class="small">${company.address}</div>` : ''}
    ${company.phone ? `<div class="small">Tel: ${company.phone}</div>` : ''}
    ${company.taxId ? `<div class="small">${labels.taxId}: ${company.taxId}</div>` : ''}
  </header>

  <table class="meta">
    <tr><td>${labels.number}</td><td>${details.number}</td></tr>
    <tr><td>${labels.date}</td><td>${details.issueDate}</td></tr>
    <tr><td>${labels.customer}</td><td>${client.name || '-'}</td></tr>
    <tr><td>${labels.tax}</td><td>${number(summary.tax)} ${currency}</td></tr>
  </table>

  <div class="rule"></div>
  <div class="section-title">&lt;&lt; ${labels.summary} &gt;&gt;</div>

  <table class="items">
    <thead>
      <tr>
        <th class="description">${labels.description}</th>
        <th class="quantity">${labels.qty}</th>
        <th class="price">${labels.price}</th>
        <th class="value">${labels.value}</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
        <tr>
          <td>${item.description}${item.sku ? `<div class="small">${item.sku}</div>` : ''}</td>
          <td>${number(item.quantity)}</td>
          <td>${number(item.price)}</td>
          <td>${number(item.total)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>${labels.subtotal}:</td><td>${number(summary.subtotal)} ${currency}</td></tr>
    ${summary.discount > 0 ? `<tr><td>${labels.discount}:</td><td>-${number(summary.discount)} ${currency}</td></tr>` : ''}
    <tr><td>${labels.tax}:</td><td>${number(summary.tax)} ${currency}</td></tr>
    <tr class="grand-total"><td>${labels.total}:</td><td>${number(summary.total)} ${currency}</td></tr>
  </table>

  ${details.paymentMethod ? `
    <div class="payment"><span class="bold">${labels.payment}:</span> ${paymentLabels[details.paymentMethod] || details.paymentMethod}</div>
  ` : ''}
  ${Number(details.amountReceived) > 0 ? `
    <table class="totals">
      <tr><td>${labels.received}:</td><td>${number(Number(details.amountReceived))} ${currency}</td></tr>
      <tr><td>${labels.change}:</td><td>${number(Number(details.changeAmount))} ${currency}</td></tr>
    </table>
  ` : ''}

  <div class="footer">
    <div class="rule"></div>
    <div class="bold">${labels.thankYou}</div>
    ${company.email ? `<div>${company.email}</div>` : ''}
    ${company.website ? `<div>${company.website}</div>` : ''}
  </div>
</body>
</html>
  `;
}
