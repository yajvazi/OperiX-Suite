import type { TextStyle, ViewStyle } from 'react-native';

/**
 * OperiX Mobile tokens.
 *
 * Invoice Mobile is the reference implementation for these values. Product
 * screens may add domain-specific layout, but common controls should use this
 * token set instead of introducing local brand values.
 */
export const operixMobileTokens = {
    name: 'OperiX Mobile',
    colors: {
        primary: '#004FFE',
        primaryPressed: '#0043D8',
        blue: '#3388FF',
        navy: '#061A38',
        navySoft: '#0D1B2A',
        white: '#FFFFFF',
        background: '#F7F9FC',
        surface: '#FFFFFF',
        surfaceMuted: '#F4F7FB',
        softBlue: '#EDF4FF',
        text: '#111827',
        textSecondary: '#344054',
        muted: '#667085',
        subtle: '#98A2B3',
        border: '#E4E9F0',
        borderStrong: '#D0D5DD',
        success: '#12B76A',
        successSoft: '#E9F9F0',
        info: '#06B6D4',
        infoSoft: '#E9FBFD',
        warning: '#F59E0B',
        warningSoft: '#FFF6D9',
        error: '#EF4444',
        errorSoft: '#FFF0EF',
        neutralSoft: '#F1F3F5',
        neutralText: '#4B5565',
        overlay: 'rgba(7, 20, 42, 0.38)',
    },
    spacing: {
        none: 0,
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        xxl: 24,
        xxxl: 28,
        huge: 32,
    },
    layout: {
        screenPadding: 24,
        compactScreenPadding: 20,
        sectionSpacing: 20,
        cardPadding: 16,
        headerHeight: 68,
        bottomNavigationHeightIOS: 88,
        bottomNavigationHeightAndroid: 68,
    },
    radii: {
        control: 14,
        input: 14,
        card: 16,
        panel: 20,
        modal: 24,
        bottomSheet: 28,
        pill: 999,
        circle: 999,
    },
    typography: {
        fontFamily: {
            regular: 'Poppins_400Regular',
            medium: 'Poppins_500Medium',
            semibold: 'Poppins_600SemiBold',
            logo: 'OblivianTextBold',
        },
        size: {
            caption: 10,
            label: 11,
            bodySmall: 12,
            body: 14,
            bodyLarge: 16,
            section: 19,
            title: 25,
            display: 28,
        },
        lineHeight: {
            caption: 14,
            bodySmall: 17,
            body: 20,
            bodyLarge: 24,
            section: 26,
            title: 31,
            display: 34,
        },
        weight: {
            regular: '400',
            medium: '500',
            semibold: '600',
        },
    },
    icon: {
        xs: 14,
        sm: 18,
        md: 21,
        lg: 24,
        xl: 28,
    },
    touchTarget: 44,
    animation: {
        fast: 150,
        normal: 220,
        slow: 300,
    },
    safeArea: {
        top: 0,
        bottom: 0,
    },
    shadow: {
        card: {
            shadowColor: '#101828',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
            elevation: 1,
        } satisfies ViewStyle,
        floating: {
            shadowColor: '#101828',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.08,
            shadowRadius: 18,
            elevation: 4,
        } satisfies ViewStyle,
    },
} as const;

export type OperixStatusTone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

export type OperixMobilePalette = {
    background: string;
    surface: string;
    surfaceMuted: string;
    text: string;
    textSecondary: string;
    muted: string;
    subtle: string;
    border: string;
    borderStrong: string;
    iconSurface: string;
    primary: string;
    primaryPressed: string;
    success: string;
    successSoft: string;
    info: string;
    infoSoft: string;
    warning: string;
    warningSoft: string;
    error: string;
    errorSoft: string;
    neutralSoft: string;
    neutralText: string;
    onPrimary: string;
};

export const lightPalette: OperixMobilePalette = {
    background: operixMobileTokens.colors.background,
    surface: operixMobileTokens.colors.surface,
    surfaceMuted: operixMobileTokens.colors.surfaceMuted,
    text: operixMobileTokens.colors.text,
    textSecondary: operixMobileTokens.colors.textSecondary,
    muted: operixMobileTokens.colors.muted,
    subtle: operixMobileTokens.colors.subtle,
    border: operixMobileTokens.colors.border,
    borderStrong: operixMobileTokens.colors.borderStrong,
    iconSurface: operixMobileTokens.colors.softBlue,
    primary: operixMobileTokens.colors.primary,
    primaryPressed: operixMobileTokens.colors.primaryPressed,
    success: operixMobileTokens.colors.success,
    successSoft: operixMobileTokens.colors.successSoft,
    info: operixMobileTokens.colors.info,
    infoSoft: operixMobileTokens.colors.infoSoft,
    warning: operixMobileTokens.colors.warning,
    warningSoft: operixMobileTokens.colors.warningSoft,
    error: operixMobileTokens.colors.error,
    errorSoft: operixMobileTokens.colors.errorSoft,
    neutralSoft: operixMobileTokens.colors.neutralSoft,
    neutralText: operixMobileTokens.colors.neutralText,
    onPrimary: operixMobileTokens.colors.white,
};

export const darkPalette: OperixMobilePalette = {
    background: operixMobileTokens.colors.navySoft,
    surface: '#14243A',
    surfaceMuted: '#102038',
    text: '#FFFFFF',
    textSecondary: '#E4E9F0',
    muted: '#98A2B3',
    subtle: '#7C8DA6',
    border: '#263A55',
    borderStrong: '#304766',
    iconSurface: '#102D5D',
    primary: operixMobileTokens.colors.primary,
    primaryPressed: operixMobileTokens.colors.primaryPressed,
    success: operixMobileTokens.colors.success,
    successSoft: '#123B2C',
    info: operixMobileTokens.colors.info,
    infoSoft: '#103942',
    warning: operixMobileTokens.colors.warning,
    warningSoft: '#473514',
    error: operixMobileTokens.colors.error,
    errorSoft: '#481F23',
    neutralSoft: '#263244',
    neutralText: '#D0D5DD',
    onPrimary: operixMobileTokens.colors.white,
};

export function getOperixPalette(isDark: boolean, primaryColor: string = operixMobileTokens.colors.primary): OperixMobilePalette {
    const palette = isDark ? darkPalette : lightPalette;
    return { ...palette, primary: primaryColor };
}

/** Compatibility alias for existing mobile consumers. */
export const getPalette = getOperixPalette;

export function statusToneFor(status?: string | null): OperixStatusTone {
    const normalized = (status || '').toLowerCase().replace(/[_-]/g, ' ');
    if (['paid', 'completed', 'confirmed', 'approved', 'active', 'delivered', 'signed', 'success'].includes(normalized)) return 'success';
    if (['pending', 'partial', 'processing', 'issued', 'rescheduled', 'warning'].includes(normalized)) return normalized === 'issued' ? 'info' : 'warning';
    if (['overdue', 'cancelled', 'canceled', 'rejected', 'error', 'no show', 'terminated'].includes(normalized)) return 'error';
    if (['sent', 'info', 'in progress'].includes(normalized)) return 'info';
    return 'neutral';
}

export function toneColors(palette: OperixMobilePalette, tone: OperixStatusTone) {
    switch (tone) {
        case 'success': return { background: palette.successSoft, foreground: palette.success };
        case 'warning': return { background: palette.warningSoft, foreground: palette.warning };
        case 'error': return { background: palette.errorSoft, foreground: palette.error };
        case 'info': return { background: palette.infoSoft, foreground: palette.info };
        default: return { background: palette.neutralSoft, foreground: palette.neutralText };
    }
}

export type OperixTextToken = keyof typeof operixMobileTokens.typography.size;
export type OperixTextStyle = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'fontWeight'>;
