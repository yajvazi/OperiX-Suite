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
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OperixMobileAppShell } from '@invoice-monorepo/ui';
import { AppNavigator } from './navigation/AppNavigator';
import { brand } from './theme/brand';
import { deactivatePushNotifications, registerPushNotifications } from './services/pushNotifications';

const OblivianTextBold = require('../assets/fonts/OblivianText-Bold.otf');

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function ThemedAppContent() {
    const { isDark } = useTheme();

    return (
        <>
            <AppNavigator />
            <StatusBar
                style={isDark ? 'light' : 'dark'}
                backgroundColor={isDark ? '#0D1B2A' : '#F7F9FC'}
            />
        </>
    );
}

function PushNotificationBootstrap() {
    const { user } = useAuth();

    useEffect(() => {
        if (!user?.id) return undefined;
        void registerPushNotifications(user.id).catch((error) => {
            console.warn('Push notification registration unavailable:', error);
        });
        return () => {
            void deactivatePushNotifications(user.id).catch((error) => {
                console.warn('Push notification cleanup unavailable:', error);
            });
        };
    }, [user?.id]);

    return null;
}

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
        // Forms should keep the software keyboard open while the user moves
        // between fields. Screens can explicitly opt into blurOnSubmit when
        // a field is meant to finish a form.
        input.defaultProps.blurOnSubmit = false;
        setTypographyReady(true);
        SplashScreen.hideAsync().catch(() => undefined);
    }, [fontsLoaded]);

    if (!fontsLoaded || !typographyReady) return null;

    return (
        <ThemeProvider>
            <AuthProvider>
                <SafeAreaProvider>
            <OperixMobileAppShell product="invoice"><PushNotificationBootstrap /><ThemedAppContent /></OperixMobileAppShell>
                </SafeAreaProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
