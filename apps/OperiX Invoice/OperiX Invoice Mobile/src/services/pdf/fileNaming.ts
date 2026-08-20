import * as FileSystem from 'expo-file-system/legacy';

export function sanitizePdfFileName(fileName: string): string {
    return fileName
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' - ')
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*-\s*/g, ' - ')
        .replace(/[. ]+$/g, '')
        .slice(0, 180);
}

export async function namePdfFile(uri: string, fileName?: string): Promise<string> {
    const safeFileName = fileName ? sanitizePdfFileName(fileName) : '';
    if (!safeFileName || !FileSystem.cacheDirectory) return uri;

    const namedUri = `${FileSystem.cacheDirectory}${safeFileName}.pdf`;
    await FileSystem.deleteAsync(namedUri, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: namedUri });
    return namedUri;
}

export function documentPdfFileName(tenantName: string, documentId: string, clientName: string): string {
    return `${tenantName} - ${documentId} - ${clientName}`;
}

export function reportPdfFileName(tenantName: string, reportName: string, date = new Date()): string {
    const datePart = date.toISOString().slice(0, 10);
    return `${tenantName} - ${reportName} - ${datePart}`;
}

function zipDatePart(value?: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    return match ? `${match[3]}-${match[2]}-${match[1]}` : 'All dates';
}

/** Builds a filesystem-safe ZIP name using the requested DD/MM/YYYY ordering. */
export function dateRangeZipFileName(tenantName: string, pageName: string, from?: string, to?: string): string {
    return `${tenantName} - ${pageName} - ${zipDatePart(from)} - ${zipDatePart(to)}`;
}
