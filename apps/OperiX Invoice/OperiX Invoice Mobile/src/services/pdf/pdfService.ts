import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { InvoiceData, TemplateType } from '@invoice-monorepo/types';
import { generateInvoiceHtml } from './TemplateFactory';
import { getThermalPageHeight } from './templates/receipt';
import { t } from '@invoice-monorepo/i18n';
import { namePdfFile } from './fileNaming';

// A4 dimensions at 72 PPI, which is the coordinate system used by PDF/print.
const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 };
const PRINT_BUSY_ERROR = 'PRINT_BUSY';
let nativePrintBusy = false;

export interface PdfResult {
    uri: string;
    success: boolean;
    error?: string;
}

/**
 * Generate a PDF from invoice data using the specified template
 */
async function generatePdfInternal(
    data: InvoiceData,
    template: TemplateType = 'corporate',
    fileName?: string,
): Promise<PdfResult> {
    try {
        const html = generateInvoiceHtml(data, template);
        const isThermal = template === 'thermal' || data.config?.style === 'thermal' || data.config?.pageSize === 'Receipt';

        const { uri } = await Print.printToFileAsync({
            html,
            base64: false,
            width: isThermal ? 142 : A4_WIDTH,
            height: isThermal ? getThermalPageHeight(data.items.length) : A4_HEIGHT,
            margins: NO_MARGINS,
        });

        return { uri: await namePdfFile(uri, fileName), success: true };
    } catch (error) {
        const printBusy = error instanceof Error && /another print request is already in progress/i.test(error.message);
        return {
            uri: '',
            success: false,
            error: printBusy ? PRINT_BUSY_ERROR : t('failedToGeneratePdf', data.details.language || 'en'),
        };
    }
}

export async function generatePdf(
    data: InvoiceData,
    template: TemplateType = 'corporate',
    fileName?: string,
): Promise<PdfResult> {
    if (nativePrintBusy) return { uri: '', success: false, error: PRINT_BUSY_ERROR };
    nativePrintBusy = true;
    try {
        return await generatePdfInternal(data, template, fileName);
    } finally {
        nativePrintBusy = false;
    }
}

/**
 * Share a PDF via the system share sheet (email, messages, etc.)
 */
export async function sharePdf(uri: string): Promise<boolean> {
    try {
        const isAvailable = await Sharing.isAvailableAsync();

        if (!isAvailable) {
            throw new Error('Sharing is not available on this device');
        }

        await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Share Invoice',
            UTI: 'com.adobe.pdf',
        });

        return true;
    } catch (error) {
        console.error('Share error:', error);
        return false;
    }
}

/**
 * Print a PDF directly
 */
export async function printPdf(
    data: InvoiceData,
    template: TemplateType = 'corporate',
    fileName?: string,
): Promise<{ success: boolean; canceled?: boolean; error?: string }> {
    if (nativePrintBusy) return { success: false, canceled: true };
    nativePrintBusy = true;
    try {
        // Print the generated PDF rather than the HTML. iOS otherwise lays the
        // HTML out again using printer-specific margins, which can split a
        // footer that fits correctly in the invoice preview.
        const pdf = await generatePdfInternal(data, template, fileName);
        if (!pdf.success || !pdf.uri) {
            if (pdf.error === PRINT_BUSY_ERROR) return { success: false, canceled: true };
            throw new Error(pdf.error || t('failedToGeneratePdf', data.details.language || 'en'));
        }

        await Print.printAsync({
            uri: pdf.uri,
        });

        return { success: true };
    } catch (error: any) {
        // "Printing did not complete" usually means the user closed the print dialog
        if (error.message?.includes('Printing did not complete') || error.message?.includes('cancelled')) {
            return { success: false, canceled: true };
        }
        if (error.message?.includes('Another print request is already in progress')) {
            return { success: false, canceled: true };
        }
        console.error('Print error:', error);
        return { success: false, error: t('failedToPrint', data.details.language || 'en') };
    } finally {
        nativePrintBusy = false;
    }
}

/**
 * Preview PDF in browser (web only)
 */
export async function previewPdf(
    data: InvoiceData,
    template: TemplateType = 'corporate'
): Promise<void> {
    const html = generateInvoiceHtml(data, template);

    // For development/preview, just log the HTML
    console.log('Preview HTML generated');

    // In production, this would open a webview or browser
}
