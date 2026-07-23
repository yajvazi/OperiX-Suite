import { InvoiceData } from '@invoice-monorepo/types';

export function getThermalPageHeight(itemCount: number): number {
  // Height in PDF points. Thermal rolls have a fixed width but variable length.
  return Math.max(430, 360 + itemCount * 34);
}

export function receiptTemplate(data: InvoiceData): string {
  const { company, client, details, items, summary } = data;
  const currency = 'EUR';
  const pageHeightPoints = getThermalPageHeight(items.length);
  const pageHeightMm = Math.ceil((pageHeightPoints / 72) * 25.4);

  const number = (value: number) => new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

  const paymentLabels: Record<string, string> = {
    cash: 'PARA TË GATSHME',
    bank: 'BANKË',
    card: 'KARTELË',
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
    <div class="company">${company.name || 'BIZNESI'}</div>
    ${company.address ? `<div class="small">${company.address}</div>` : ''}
    ${company.phone ? `<div class="small">Tel: ${company.phone}</div>` : ''}
    ${company.taxId ? `<div class="small">NUI/NR. FISKAL: ${company.taxId}</div>` : ''}
  </header>

  <table class="meta">
    <tr><td>Nr:</td><td>${details.number}</td></tr>
    <tr><td>Data:</td><td>${details.issueDate}</td></tr>
    <tr><td>Klienti:</td><td>${client.name || '-'}</td></tr>
    <tr><td>TVSH:</td><td>${number(summary.tax)} ${currency}</td></tr>
  </table>

  <div class="rule"></div>
  <div class="section-title">&lt;&lt; PËRMBLEDHJE E FATURËS &gt;&gt;</div>

  <table class="items">
    <thead>
      <tr>
        <th class="description">Përshkrim</th>
        <th class="quantity">Sasi</th>
        <th class="price">Çmim</th>
        <th class="value">Vlera</th>
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
    <tr><td>Nëntotali:</td><td>${number(summary.subtotal)} ${currency}</td></tr>
    ${summary.discount > 0 ? `<tr><td>Zbritja:</td><td>-${number(summary.discount)} ${currency}</td></tr>` : ''}
    <tr><td>TVSH:</td><td>${number(summary.tax)} ${currency}</td></tr>
    <tr class="grand-total"><td>TOTALI:</td><td>${number(summary.total)} ${currency}</td></tr>
  </table>

  ${details.paymentMethod ? `
    <div class="payment"><span class="bold">Pagesa:</span> ${paymentLabels[details.paymentMethod] || details.paymentMethod}</div>
  ` : ''}
  ${Number(details.amountReceived) > 0 ? `
    <table class="totals">
      <tr><td>Pranuar:</td><td>${number(Number(details.amountReceived))} ${currency}</td></tr>
      <tr><td>Kusuri:</td><td>${number(Number(details.changeAmount))} ${currency}</td></tr>
    </table>
  ` : ''}

  <div class="footer">
    <div class="rule"></div>
    <div class="bold">JU FALEMINDERIT!</div>
    ${company.email ? `<div>${company.email}</div>` : ''}
    ${company.website ? `<div>${company.website}</div>` : ''}
  </div>
</body>
</html>
  `;
}
