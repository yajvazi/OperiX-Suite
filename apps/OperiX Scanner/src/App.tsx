import React from 'react';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, useFonts } from '@expo-google-fonts/poppins';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, ThemeProvider } from '@invoice-monorepo/context';
import { AppNavigator } from './navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OperixMobileAppShell } from '@invoice-monorepo/ui';

export function App() {
    const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
    if (!fontsLoaded) return null;
    return (
        <ThemeProvider>
            <AuthProvider>
                <SafeAreaProvider><OperixMobileAppShell product="scanner"><AppNavigator /></OperixMobileAppShell></SafeAreaProvider>
                <StatusBar style="auto" />
            </AuthProvider>
        </ThemeProvider>
    );
}



