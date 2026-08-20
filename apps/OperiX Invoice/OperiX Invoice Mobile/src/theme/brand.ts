import { getOperixPalette, operixMobileTokens } from '@invoice-monorepo/ui';

/**
 * Compatibility facade for Invoice Mobile's existing screen imports.
 * The values are owned by @invoice-monorepo/ui/mobile/tokens.
 */
export const brand = {
    ...operixMobileTokens,
    name: 'OperiX Invoice',
    colors: {
        ...operixMobileTokens.colors,
        lightBlue: '#8CC2FF',
    },
    fonts: {
        ...operixMobileTokens.typography.fontFamily,
        logoProduct: operixMobileTokens.typography.fontFamily.logo,
    },
    radius: operixMobileTokens.radii,
    spacing: operixMobileTokens.spacing,
    shadow: operixMobileTokens.shadow,
} as const;

export const lightPalette = getOperixPalette(false);
export const darkPalette = getOperixPalette(true);
export function getPalette(isDark: boolean) {
    return getOperixPalette(isDark);
}

const legacyPurpleAccents = new Set([
    '#6366f1',
    '#818cf8',
    '#4f46e5',
    '#7c3aed',
    '#8b5cf6',
    '#9333ea',
    '#a855f7',
]);

export function normalizeBrandColor(color?: string | null) {
    if (!color || legacyPurpleAccents.has(color.toLowerCase())) return brand.colors.primary;
    return color;
}
