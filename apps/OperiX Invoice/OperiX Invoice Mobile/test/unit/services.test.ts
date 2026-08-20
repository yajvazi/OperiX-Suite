import { Alert, Linking } from 'react-native';
import { setAppLocale } from '@invoice-monorepo/i18n';
import { generateInvoiceHtml } from '../../src/services/pdf/TemplateFactory';
import { generatePdf, printPdf, sharePdf } from '../../src/services/pdf/pdfService';
import { generateTransactionPdf } from '../../src/services/pdf/transactionPdf';
import { mobileCacheKey, readMobileCache, writeMobileCache } from '../../src/services/mobileCache';
import { openExternalLink } from '../../src/services/externalLinks';
import { formatPdfDate } from '../../src/services/pdf/dateFormatting';

const invoiceData: any = {
    company: { name: 'OperiX', address: 'Main <Street>', city: 'Prishtinë', country: 'Kosovo', email: 'hello@example.com', primaryColor: '#004FFE' },
    client: { name: 'Blerina & Co', address: 'Rruga <1>', city: 'Prishtinë', country: 'Kosovo' },
    details: { number: 'FAT-2026-0001', issueDate: '2026-08-19', dueDate: '2026-09-18', currency: 'EUR', language: 'en', notes: 'Thank you', type: 'invoice', commercialDocumentType: 'INVOICE', status: 'draft' },
    items: [{ description: 'Service', quantity: 2, price: 10, total: 20, taxable: 20, tax: 3.6, taxRate: 18, unit: 'pcs' }],
    summary: { subtotal: 20, tax: 3.6, discount: 0, total: 23.6, discountPercent: 0 },
    config: { pageSize: 'A4', style: 'corporate', showLogo: false, showSignature: false, showBuyerSignature: false, showStamp: false, showQrCode: false, showNotes: true, showDiscount: true, showTax: true, showBankDetails: false, visibleColumns: {} },
};

describe('PDF/document services', () => {
    it('formats PDF dates as DD/MM/YYYY without changing stored values', () => {
        expect(formatPdfDate('2026-08-19')).toBe('19/08/2026');
        expect(formatPdfDate('2026-08-19T12:00:00Z')).toBe('19/08/2026');
        expect(formatPdfDate('19/08/2026')).toBe('19/08/2026');
    });

    it('selects the correct corporate and receipt template and escapes untrusted HTML', () => {
        const corporate = generateInvoiceHtml(invoiceData, 'corporate');
        expect(corporate).toContain('Main &lt;Street&gt;');
        expect(corporate).toContain('Blerina &amp; Co');
        expect(corporate).toContain('19/08/2026');
        expect(corporate).toContain('18/09/2026');
        const receipt = generateInvoiceHtml({ ...invoiceData, config: { ...invoiceData.config, pageSize: 'Receipt' } }, 'corporate');
        expect(receipt).toContain('@page { size: 50mm 152mm; margin: 0; }');
        expect(receipt).not.toBe(corporate);
    });

    it('generates and shares a PDF, and returns a safe failure result when print fails', async () => {
        await expect(generatePdf(invoiceData, 'corporate')).resolves.toEqual({ uri: 'file:///tmp/operix-test.pdf', success: true });
        await expect(sharePdf('file:///tmp/operix-test.pdf')).resolves.toBe(true);
        const expoPrint = require('expo-print') as { printToFileAsync: jest.Mock };
        expoPrint.printToFileAsync.mockRejectedValueOnce(new Error('printer unavailable'));
        await expect(generatePdf(invoiceData, 'corporate')).resolves.toMatchObject({ success: false, uri: '' });
    });

    it('prints generated PDFs and renders transaction details in English and Albanian', async () => {
        await expect(printPdf(invoiceData, 'thermal')).resolves.toEqual({ success: true });
        const html = await generateTransactionPdf({ title: 'Payment', number: 'PAY-1', amount: 12.5, date: '2026-08-19', method: 'cash', counterparty: 'Blerina', counterpartyType: 'customer', language: 'sq' });
        expect(html).toBe('file:///tmp/operix-test.pdf');
        expect(require('expo-print').printToFileAsync).toHaveBeenCalled();
        const printToFileAsync = require('expo-print').printToFileAsync as jest.Mock;
        const generatedHtml = printToFileAsync.mock.calls.at(-1)?.[0]?.html as string;
        expect(generatedHtml).toContain('Data');
        expect(generatedHtml).toContain('Mënyra e Pagesës');
        expect(generatedHtml).toContain('19/08/2026');
    });
});

describe('offline cache and external links', () => {
    it('separates cache keys by user, tenant scope, and variant, and restores values', async () => {
        const key = mobileCacheKey('invoices', 'user-a', ['company-b', 'company-a'], 'drafts');
        const sameScopeKey = mobileCacheKey('invoices', 'user-a', ['company-a', 'company-b'], 'drafts');
        expect(key).toBe(sameScopeKey);
        expect(key).not.toBe(mobileCacheKey('invoices', 'user-b', ['company-a', 'company-b'], 'drafts'));
        writeMobileCache(key, [{ id: 'invoice-a' }]);
        await expect(readMobileCache(key)).resolves.toEqual([{ id: 'invoice-a' }]);
    });

    it('opens a valid link and reports an unavailable link in the active language', async () => {
        const canOpenURL = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
        const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
        await openExternalLink('https://operix.example/help', 'Help');
        expect(canOpenURL).toHaveBeenCalledWith('https://operix.example/help');
        expect(openURL).toHaveBeenCalledWith('https://operix.example/help');

        setAppLocale('sq');
        canOpenURL.mockResolvedValue(false);
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        await openExternalLink('https://operix.example/missing', 'Dokumentet');
        expect(alert).toHaveBeenCalled();
        canOpenURL.mockRestore();
        openURL.mockRestore();
        alert.mockRestore();
    });
});
