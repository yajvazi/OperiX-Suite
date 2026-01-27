import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, ThemeProvider } from '@invoice-monorepo/context';
import { AppNavigator } from './navigation/AppNavigator';

export function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppNavigator />
                <StatusBar style="auto" />
            </AuthProvider>
        </ThemeProvider>
    );
}





