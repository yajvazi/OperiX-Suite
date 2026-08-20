import { getOperixPalette, operixMobileTokens } from '@invoice-monorepo/ui';

/** Compatibility facade. Booking-specific data is kept outside this token layer. */
const colors = operixMobileTokens.colors;
export const brand = {
    primary: colors.primary,
    primaryPressed: colors.primaryPressed,
    navy: colors.navy,
    navySoft: colors.navySoft,
    background: colors.background,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
    text: colors.text,
    muted: colors.muted,
    subtle: colors.subtle,
    border: colors.border,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    errorSoft: colors.errorSoft,
    fonts: operixMobileTokens.typography.fontFamily,
    radius: operixMobileTokens.radii,
    shadow: operixMobileTokens.shadow,
} as const;

export const lightPalette = getOperixPalette(false);
export const darkPalette = getOperixPalette(true);
export function getPalette(isDark: boolean) {
    return getOperixPalette(isDark);
}
