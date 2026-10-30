/**
 * Minimal QR Code encoder (byte mode, error correction level M, versions 1-6).
 * It exists so the "Connect the mobile app" panel can draw a QR code locally,
 * without a dependency and without sending the server address to a third party.
 * Capacity is 106 bytes, which is plenty for a server address.
 */

// [data codewords per block, ec codewords per block, number of blocks] for level M.
const VERSIONS: Array<{ blocks: number; data: number; ec: number; align: number[] }> = [
  { blocks: 1, data: 16, ec: 10, align: [] },
  { blocks: 1, data: 28, ec: 16, align: [6, 18] },
  { blocks: 1, data: 44, ec: 26, align: [6, 22] },
  { blocks: 2, data: 32, ec: 18, align: [6, 26] },
  { blocks: 2, data: 43, ec: 24, align: [6, 30] },
  { blocks: 4, data: 27, ec: 16, align: [6, 34] },
];

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function reedSolomon(data: number[], ecLength: number): number[] {
  let generator = [1];
  for (let i = 0; i < ecLength; i += 1) {
    const next = new Array<number>(generator.length + 1).fill(0);
    generator.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= gfMul(coefficient, EXP[i]);
    });
    generator = next;
  }
  const remainder = new Array<number>(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < ecLength; i += 1) remainder[i] ^= gfMul(generator[i + 1], factor);
  }
  return remainder;
}

function buildCodewords(bytes: number[], versionIndex: number): number[] {
  const { blocks, data, ec } = VERSIONS[versionIndex];
  const capacity = blocks * data;
  const bits: number[] = [];
  const push = (value: number, length: number) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, 8);
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0; codewords.length < capacity; pad += 1) codewords.push(pad % 2 ? 0x11 : 0xec);

  const dataBlocks: number[][] = [];
  for (let i = 0; i < blocks; i += 1) dataBlocks.push(codewords.slice(i * data, (i + 1) * data));
  const ecBlocks = dataBlocks.map((block) => reedSolomon(block, ec));
  const out: number[] = [];
  for (let i = 0; i < data; i += 1) dataBlocks.forEach((block) => out.push(block[i]));
  for (let i = 0; i < ec; i += 1) ecBlocks.forEach((block) => out.push(block[i]));
  return out;
}

type Matrix = boolean[][];

function blank(size: number): { modules: Matrix; reserved: boolean[][] } {
  return {
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function drawFunctionPatterns(modules: Matrix, reserved: boolean[][], versionIndex: number) {
  const size = modules.length;
  const set = (row: number, col: number, dark: boolean) => { modules[row][col] = dark; reserved[row][col] = true; };
  const finder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || col < 0 || row >= size || col >= size) continue;
        const dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        set(row, col, dark);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const positions = VERSIONS[versionIndex].align;
  positions.forEach((row) => positions.forEach((col) => {
    if (reserved[row][col]) return; // overlaps a finder pattern
    for (let r = -2; r <= 2; r += 1) for (let c = -2; c <= 2; c += 1) set(row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }));
  set(size - 8, 8, true); // dark module
  for (let i = 0; i < 9; i += 1) { reserved[8][i] = true; reserved[i][8] = true; }
  for (let i = 0; i < 8; i += 1) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }
}

function placeData(modules: Matrix, reserved: boolean[][], codewords: number[], remainderBits: number) {
  const size = modules.length;
  const bits: number[] = [];
  codewords.forEach((word) => { for (let i = 7; i >= 0; i -= 1) bits.push((word >> i) & 1); });
  for (let i = 0; i < remainderBits; i += 1) bits.push(0);
  let index = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let c = 0; c < 2; c += 1) {
        const x = col - c;
        if (reserved[row][x]) continue;
        modules[row][x] = index < bits.length ? bits[index] === 1 : false;
        index += 1;
      }
    }
    upward = !upward;
  }
}

const MASKS: Array<(row: number, col: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(modules: Matrix, reserved: boolean[][], mask: number): Matrix {
  return modules.map((line, row) => line.map((dark, col) => (reserved[row][col] ? dark : dark !== MASKS[mask](row, col))));
}

function drawFormat(modules: Matrix, mask: number) {
  const size = modules.length;
  const data = (0b00 << 3) | mask; // level M = 00
  let remainder = data << 10;
  for (let i = 14; i >= 10; i -= 1) if ((remainder >> i) & 1) remainder ^= 0x537 << (i - 10);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1;
    if (i < 6) modules[i][8] = dark;
    else if (i < 8) modules[i + 1][8] = dark;
    else modules[size - 15 + i][8] = dark;
    if (i < 8) modules[8][size - i - 1] = dark;
    else if (i < 9) modules[8][15 - i] = dark;
    else modules[8][15 - i - 1] = dark;
  }
  modules[size - 8][8] = true;
}

function penalty(modules: Matrix): number {
  const size = modules.length;
  let score = 0;
  const lines = [
    ...modules,
    ...Array.from({ length: size }, (_, col) => modules.map((row) => row[col])),
  ];
  lines.forEach((line) => {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) run += 1;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    const text = line.map((dark) => (dark ? '1' : '0')).join('');
    score += (text.match(/(?=(10111010000|00001011101))/g) || []).length * 40;
  });
  for (let r = 0; r < size - 1; r += 1) for (let c = 0; c < size - 1; c += 1) {
    const v = modules[r][c];
    if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
  }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/** Returns the QR matrix (true = dark module) for the given text. */
export function encodeQr(text: string, forcedMask?: number): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const versionIndex = VERSIONS.findIndex((version) => version.blocks * version.data >= bytes.length + 3);
  if (versionIndex < 0) throw new Error('Text is too long for the QR code.');
  const size = 17 + 4 * (versionIndex + 1);
  const { modules, reserved } = blank(size);
  drawFunctionPatterns(modules, reserved, versionIndex);
  placeData(modules, reserved, buildCodewords(bytes, versionIndex), versionIndex === 0 ? 0 : 7);
  const candidates = (forcedMask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [forcedMask]).map((mask) => {
    const masked = applyMask(modules, reserved, mask);
    drawFormat(masked, mask);
    return { masked, score: penalty(masked) };
  });
  return candidates.sort((a, b) => a.score - b.score)[0].masked;
}

/** SVG markup for a QR code, including the 4-module quiet zone. */
export function qrSvg(text: string, pixels = 220): string {
  const matrix = encodeQr(text);
  const quiet = 4;
  const total = matrix.length + quiet * 2;
  let path = '';
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c += 1; continue; }
      let end = c;
      while (end < row.length && row[end]) end += 1;
      path += `M${c + quiet} ${r + quiet}h${end - c}v1h-${end - c}z`;
      c = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
