import React, { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Text, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
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
import { clearDailySalesWidget, refreshDailySalesWidget } from './services/iosWidgetService';
import { restoreServerConnection } from './services/serverConnection';
import { deactivatePushNotifications, notificationLink, registerPushNotifications } from './services/pushNotifications';

const OblivianTextBold = require('../assets/fonts/OblivianText-Bold.otf');

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function ThemedAppContent() {
    const { isDark } = useTheme();

    return (
        <>
            <AppNavigator />
            <StatusBar
                style={isDark ? 'light' : 'dark'}
            />
        </>
    );
}

function PushNotificationBootstrap() {
    const { user } = useAuth();
    const { language } = useTheme();

    useEffect(() => {
        if (!user?.id) return undefined;
        void registerPushNotifications(user.id, language).catch((error) => {
            console.warn('Push notification registration unavailable:', error);
        });
        return undefined;
    }, [user?.id, language]);

    useEffect(() => {
        if (!user?.id) return undefined;
        return () => {
            void deactivatePushNotifications(user.id).catch((error) => {
                console.warn('Push notification cleanup unavailable:', error);
            });
        };
    }, [user?.id]);

    // Tapping a notification opens the invoice, payment or expense it is about.
    useEffect(() => {
        if (!user?.id || Platform.OS === 'web') return undefined;
        const open = (response: Notifications.NotificationResponse | null | undefined) => {
            const link = notificationLink(response);
            if (link) void Linking.openURL(link).catch(() => undefined);
        };
        void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
        const subscription = Notifications.addNotificationResponseReceivedListener(open);
        return () => subscription.remove();
    }, [user?.id]);

    return null;
}

/** Keeps the iOS home-screen widget current: refresh on sign-in, when the app opens and when it goes to the background. */
function WidgetBootstrap() {
    const { user } = useAuth();

    useEffect(() => {
        if (Platform.OS !== 'ios') return undefined;
        if (!user?.id) {
            clearDailySalesWidget();
            return undefined;
        }
        void refreshDailySalesWidget(user.id, { force: true });
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active' || state === 'background') void refreshDailySalesWidget(user.id, { force: state === 'background' });
        });
        return () => subscription.remove();
    }, [user?.id]);

    return null;
}

export function App() {
    const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, OblivianTextBold });
    const [typographyReady, setTypographyReady] = useState(false);
    const [serverReady, setServerReady] = useState(false);

    // A self-hosted server chosen earlier must be active before the session is read.
    useEffect(() => { void restoreServerConnection().finally(() => setServerReady(true)); }, []);

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

    if (!fontsLoaded || !typographyReady || !serverReady) return null;

    return (
        <ThemeProvider>
            <AuthProvider>
                <SafeAreaProvider>
                    <OperixMobileAppShell product="invoice"><PushNotificationBootstrap /><WidgetBootstrap /><ThemedAppContent /></OperixMobileAppShell>
                </SafeAreaProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
