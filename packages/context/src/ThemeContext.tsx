import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: 'light' | 'dark';
    themeMode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => void;
    primaryColor: string;
    setPrimaryColor: (color: string) => void;
    isDark: boolean;
    language: string;
    setLanguage: (lang: string) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@invoice_app_theme';
const PRIMARY_COLOR_KEY = '@invoice_app_primary_color';
const LANGUAGE_KEY = '@invoice_app_language';
const BRAND_BLUE = '#004FFE';
const LEGACY_PURPLE_ACCENTS = new Set([
    '#6366f1',
    '#818cf8',
    '#4f46e5',
    '#7c3aed',
    '#8b5cf6',
    '#9333ea',
    '#a855f7',
]);

const normalizePrimaryColor = (color: string) =>
    LEGACY_PURPLE_ACCENTS.has(color.toLowerCase()) ? BRAND_BLUE : color;

interface ThemeProviderProps {
    children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
    const systemColorScheme = useColorScheme();
    const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
    const [primaryColor, setPrimaryColorState] = useState(BRAND_BLUE);
    const [language, setLanguageState] = useState('en');

    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme) {
                setThemeModeState(savedTheme as ThemeMode);
            }
            const savedColor = await AsyncStorage.getItem(PRIMARY_COLOR_KEY);
            if (savedColor) {
                const migratedColor = normalizePrimaryColor(savedColor);
                setPrimaryColorState(migratedColor);
                if (migratedColor !== savedColor) await AsyncStorage.setItem(PRIMARY_COLOR_KEY, migratedColor);
            }
            const savedLang = await AsyncStorage.getItem(LANGUAGE_KEY);
            if (savedLang) {
                setLanguageState(savedLang);
            }
        } catch (error) {
            console.log('Error loading preferences:', error);
        }
    };

    const setThemeMode = async (mode: ThemeMode) => {
        setThemeModeState(mode);
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
        } catch (error) {
            console.log('Error saving theme preference:', error);
        }
    };

    const setPrimaryColor = async (color: string) => {
        const normalizedColor = normalizePrimaryColor(color);
        setPrimaryColorState(normalizedColor);
        try {
            await AsyncStorage.setItem(PRIMARY_COLOR_KEY, normalizedColor);
        } catch (error) {
            console.log('Error saving primary color:', error);
        }
    };

    const setLanguage = async (lang: string) => {
        setLanguageState(lang);
        try {
            await AsyncStorage.setItem(LANGUAGE_KEY, lang);
        } catch (error) {
            console.log('Error saving language:', error);
        }
    };

    const theme: 'light' | 'dark' =
        themeMode === 'system'
            ? systemColorScheme === 'dark'
                ? 'dark'
                : 'light'
            : themeMode;

    const isDark = theme === 'dark';

    return (
        <ThemeContext.Provider
            value={{
                theme,
                themeMode,
                setThemeMode,
                primaryColor,
                setPrimaryColor,
                isDark,
                language,
                setLanguage,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}
