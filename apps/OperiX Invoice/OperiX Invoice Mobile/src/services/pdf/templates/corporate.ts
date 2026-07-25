import { InvoiceData } from '@invoice-monorepo/types';
import { corporateInvoiceTemplate } from '@invoice-monorepo/invoice-template';

/**
 * The corporate A4 document is shared with the web app. Keeping this adapter
 * intentionally small prevents the mobile preview and native print renderer
 * from drifting away from the portal and web invoice preview.
 */
export function corporateTemplate(data: InvoiceData): string {
  return corporateInvoiceTemplate({
    ...data,
    config: {
      showLogo: true,
      showSignature: true,
      showBuyerSignature: true,
      showStamp: true,
      showQrCode: true,
      showNotes: true,
      showDiscount: true,
      showTax: true,
      showBankDetails: true,
      visibleColumns: {
        rowNumber: true,
        sku: true,
        description: true,
        quantity: true,
        unit: true,
        unitPrice: true,
        discount: true,
        taxRate: true,
        lineTotal: true,
        grossPrice: true,
        ...data.config?.visibleColumns,
      },
      labels: {},
      pageSize: 'A4',
      ...data.config,
    },
  });
}
