import React, { useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    useFonts,
} from '@expo-google-fonts/poppins';
import { AuthProvider, ThemeProvider } from '@invoice-monorepo/context';
import { AppNavigator } from './navigation/AppNavigator';
import { brand } from './theme/brand';

const OblivianTextBold = require('../assets/fonts/OblivianText-Bold.otf');

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export function App() {
    const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, OblivianTextBold });
    const [typographyReady, setTypographyReady] = useState(false);

    useEffect(() => {
        if (!fontsLoaded) return;
        const text = Text as any;
        const input = TextInput as any;
        text.defaultProps = text.defaultProps || {};
        input.defaultProps = input.defaultProps || {};
        text.defaultProps.style = [{ fontFamily: brand.fonts.regular }, text.defaultProps.style];
        input.defaultProps.style = [{ fontFamily: brand.fonts.regular }, input.defaultProps.style];
        setTypographyReady(true);
        SplashScreen.hideAsync().catch(() => undefined);
    }, [fontsLoaded]);

    if (!fontsLoaded || !typographyReady) return null;

    return (
        <ThemeProvider>
            <AuthProvider>
                <AppNavigator />
                <StatusBar style="auto" backgroundColor="transparent" />
            </AuthProvider>
        </ThemeProvider>
    );
}


