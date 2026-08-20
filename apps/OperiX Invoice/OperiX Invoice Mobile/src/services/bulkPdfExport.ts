import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { sanitizePdfFileName } from './pdf/fileNaming';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

export type BulkPdfFile = {
    name: string;
    uri: string;
    /** Optional ZIP path. Slashes are preserved to create report folders. */
    path?: string;
};

function concatBytes(parts: Uint8Array[]) {
    const totalLength = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach((part) => {
        result.set(part, offset);
        offset += part.length;
    });
    return result;
}

function uint16(value: number) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32(value: number) {
    return new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
    ]);
}

function utf8(value: string) {
    return new TextEncoder().encode(value);
}

function crc32(bytes: Uint8Array) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function decodeBase64(value: string) {
    const normalized = value.replace(/\s/g, '');
    const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const output = new Uint8Array(Math.floor((normalized.length * 3) / 4) - (normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0));
    let outputIndex = 0;
    for (let index = 0; index < normalized.length; index += 4) {
        const a = lookup.indexOf(normalized[index] || 'A');
        const b = lookup.indexOf(normalized[index + 1] || 'A');
        const c = lookup.indexOf(normalized[index + 2] || 'A');
        const d = lookup.indexOf(normalized[index + 3] || 'A');
        const value = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
        if (outputIndex < output.length) output[outputIndex++] = (value >>> 16) & 0xff;
        if (outputIndex < output.length && normalized[index + 2] !== '=') output[outputIndex++] = (value >>> 8) & 0xff;
        if (outputIndex < output.length && normalized[index + 3] !== '=') output[outputIndex++] = value & 0xff;
    }
    return output;
}

function encodeBase64(bytes: Uint8Array) {
    const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let index = 0; index < bytes.length; index += 3) {
        const a = bytes[index];
        const b = bytes[index + 1];
        const c = bytes[index + 2];
        const value = (a << 16) | ((b || 0) << 8) | (c || 0);
        result += lookup[(value >>> 18) & 63];
        result += lookup[(value >>> 12) & 63];
        result += index + 1 < bytes.length ? lookup[(value >>> 6) & 63] : '=';
        result += index + 2 < bytes.length ? lookup[value & 63] : '=';
    }
    return result;
}

export async function generateBulkPdf(html: string, options?: { landscape?: boolean }) {
    const landscape = options?.landscape === true;
    const result = await Print.printToFileAsync({
        html,
        base64: false,
        width: landscape ? A4_HEIGHT : A4_WIDTH,
        height: landscape ? A4_WIDTH : A4_HEIGHT,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return result.uri;
}

export async function createPdfZip(files: BulkPdfFile[], zipName: string) {
    if (!FileSystem.cacheDirectory) throw new Error('A temporary file directory is unavailable.');
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
        const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const data = decodeBase64(base64);
        const entryPath = file.path || file.name;
        const fileName = utf8(`${entryPath.split('/').map((segment) => sanitizePdfFileName(segment)).join('/').replace(/\.pdf$/i, '')}.pdf`);
        const checksum = crc32(data);
        const localHeader = concatBytes([
            uint32(0x04034b50), uint16(20), uint16(0x800), uint16(0), uint16(0), uint16(0),
            uint32(checksum), uint32(data.length), uint32(data.length), uint16(fileName.length), uint16(0), fileName,
        ]);
        localParts.push(localHeader, data);

        const centralHeader = concatBytes([
            uint32(0x02014b50), uint16(20), uint16(20), uint16(0x800), uint16(0), uint16(0), uint16(0),
            uint32(checksum), uint32(data.length), uint32(data.length), uint16(fileName.length), uint16(0), uint16(0),
            uint16(0), uint16(0), uint32(0), uint32(offset), fileName,
        ]);
        centralParts.push(centralHeader);
        offset += localHeader.length + data.length;
    }

    const centralDirectory = concatBytes(centralParts);
    const localDirectory = concatBytes(localParts);
    const endRecord = concatBytes([
        uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
        uint32(centralDirectory.length), uint32(localDirectory.length), uint16(0),
    ]);
    const zipBytes = concatBytes([localDirectory, centralDirectory, endRecord]);
    const safeName = sanitizePdfFileName(zipName).replace(/\.zip$/i, '') || 'OperiX documents';
    const uri = `${FileSystem.cacheDirectory}${safeName}.zip`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.writeAsStringAsync(uri, encodeBase64(zipBytes), { encoding: FileSystem.EncodingType.Base64 });
    return uri;
}

export async function sharePdfZip(uri: string, dialogTitle: string) {
    if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
    await Sharing.shareAsync(uri, {
        mimeType: 'application/zip',
        dialogTitle,
        UTI: 'com.pkware.zip-archive',
    });
}
