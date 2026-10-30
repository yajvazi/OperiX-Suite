// Round company stamp as an SVG data URL; the same design the mobile app generates.
const VIEW_SIZE = 280;
const CENTER = VIEW_SIZE / 2;
const CURVED_TEXT_RADIUS = 82;
const MAX_CURVED_TEXT_SPREAD = 112;

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function curvedLetterPositions(value: string, bottom = false) {
  const letters = Array.from(value.trim().toUpperCase());
  if (letters.length === 0) return [];

  const step = letters.length > 1
    ? Math.min(12, MAX_CURVED_TEXT_SPREAD / (letters.length - 1))
    : 0;
  const spread = step * Math.max(letters.length - 1, 0);

  return letters.map((letter, index) => {
    const angle = bottom
      ? 90 + spread / 2 - index * step
      : -90 - spread / 2 + index * step;
    const radians = angle * Math.PI / 180;
    const x = CENTER + CURVED_TEXT_RADIUS * Math.cos(radians);
    const y = CENTER + CURVED_TEXT_RADIUS * Math.sin(radians);

    return {
      letter,
      x,
      y,
      // Rotate each glyph along the tangent while keeping the text
      // upright on both the upper and lower half of the stamp.
      rotation: bottom ? angle - 90 : angle + 90,
    };
  });
}

function buildCurvedSvgText(value: string, bottom: boolean, color: string, fontSize: number) {
  return curvedLetterPositions(value, bottom)
    .map(({ letter, x, y, rotation }) => {
      const formattedX = x.toFixed(2);
      const formattedY = y.toFixed(2);
      return `<text x="${formattedX}" y="${formattedY}" transform="rotate(${rotation.toFixed(2)} ${formattedX} ${formattedY})" fill="${color}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(letter)}</text>`;
    })
    .join('');
}

export function buildStampSvg(companyName: string, topText: string, bottomText: string, color: string) {
  const safeCompanyName = escapeXml(companyName.trim());
  const curvedTopText = buildCurvedSvgText(topText, false, color, 19);
  const curvedBottomText = buildCurvedSvgText(bottomText, true, color, 17);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_SIZE}" height="${VIEW_SIZE}" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}"><circle cx="${CENTER}" cy="${CENTER}" r="119" fill="none" stroke="${color}" stroke-width="5"/><circle cx="${CENTER}" cy="${CENTER}" r="103" fill="none" stroke="${color}" stroke-width="2"/>${curvedTopText}<text x="${CENTER}" y="${CENTER + 7}" fill="${color}" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="middle">${safeCompanyName}</text>${curvedBottomText}</svg>`;
}

export function stampDataUrl(companyName: string, topText: string, bottomText: string, color: string) {
  return `data:image/svg+xml,${encodeURIComponent(buildStampSvg(companyName, topText, bottomText, color))}`;
}
