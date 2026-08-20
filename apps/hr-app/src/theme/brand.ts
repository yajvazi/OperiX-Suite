import { getOperixPalette, operixMobileTokens } from '@invoice-monorepo/ui';

/** Product label only; all visual tokens are shared with Invoice Mobile. */
export const brand = {
    ...operixMobileTokens,
    name: 'OperiX HR',
    colors: operixMobileTokens.colors,
    fonts: operixMobileTokens.typography.fontFamily,
    radius: operixMobileTokens.radii,
    shadow: operixMobileTokens.shadow,
} as const;

export const lightPalette = getOperixPalette(false);
export const darkPalette = getOperixPalette(true);
export function getPalette(isDark: boolean) {
    return getOperixPalette(isDark);
}
