import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { InvoiceData, TemplateType } from '@invoice-monorepo/types';
import { generateInvoiceHtml } from './TemplateFactory';
import { getThermalPageHeight } from './templates/receipt';

// A4 dimensions at 72 PPI, which is the coordinate system used by PDF/print.
const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 };

export interface PdfResult {
    uri: string;
    success: boolean;
    error?: string;
}

/**
 * Generate a PDF from invoice data using the specified template
 */
export async function generatePdf(
    data: InvoiceData,
    template: TemplateType = 'corporate'
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

        return { uri, success: true };
    } catch (error) {
        return {
            uri: '',
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate PDF',
        };
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
    template: TemplateType = 'corporate'
): Promise<{ success: boolean; canceled?: boolean; error?: string }> {
    try {
        // Print the generated PDF rather than the HTML. iOS otherwise lays the
        // HTML out again using printer-specific margins, which can split a
        // footer that fits correctly in the invoice preview.
        const pdf = await generatePdf(data, template);
        if (!pdf.success || !pdf.uri) {
            throw new Error(pdf.error || 'Failed to generate PDF for printing');
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
        console.error('Print error:', error);
        return { success: false, error: error.message };
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


