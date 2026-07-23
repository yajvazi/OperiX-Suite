export const brand = {
    name: 'OperiX Invoice',
    colors: {
        primary: '#004FFE',
        primaryPressed: '#0043D8',
        blue: '#3388FF',
        lightBlue: '#8CC2FF',
        navy: '#061A38',
        navySoft: '#0D1B2A',
        surface: '#FFFFFF',
        background: '#F7F9FC',
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
        warning: '#F59E0B',
        error: '#EF4444',
        errorSoft: '#FFF0EF',
    },
    fonts: {
        regular: 'Poppins_400Regular',
        medium: 'Poppins_500Medium',
        semibold: 'Poppins_600SemiBold',
        logoProduct: 'OblivianTextBold',
    },
    radius: {
        control: 7,
        card: 10,
        panel: 12,
        round: 999,
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        xxl: 24,
    },
    shadow: {
        card: {
            shadowColor: '#101828',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
            elevation: 1,
        },
        floating: {
            shadowColor: '#101828',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.08,
            shadowRadius: 18,
            elevation: 4,
        },
    },
} as const;

export const lightPalette = {
    background: brand.colors.background,
    surface: brand.colors.surface,
    surfaceMuted: brand.colors.surfaceMuted,
    text: brand.colors.text,
    textSecondary: brand.colors.textSecondary,
    muted: brand.colors.muted,
    border: brand.colors.border,
    iconSurface: brand.colors.softBlue,
} as const;

export const darkPalette = {
    background: brand.colors.navySoft,
    surface: '#14243A',
    surfaceMuted: '#102038',
    text: '#FFFFFF',
    textSecondary: '#E4E9F0',
    muted: '#98A2B3',
    border: '#263A55',
    iconSurface: '#102D5D',
} as const;

export function getPalette(isDark: boolean) {
    return isDark ? darkPalette : lightPalette;
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
    if (!color || legacyPurpleAccents.has(color.toLowerCase())) {
        return brand.colors.primary;
    }
    return color;
}
