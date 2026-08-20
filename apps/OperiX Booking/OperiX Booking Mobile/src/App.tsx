import React from 'react';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, useFonts } from '@expo-google-fonts/poppins';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, ThemeProvider } from '@invoice-monorepo/context';
import { useTheme } from '@invoice-monorepo/hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { getOperixNavigationTheme, OperixMobileAppShell } from '@invoice-monorepo/ui';
import { AppNavigator } from './navigation/AppNavigator';
import { brand } from './theme/brand';
import { BookingMobileProvider } from './context/BookingMobileContext';

function AppContent() {
  const { isDark } = useTheme();
  const navigationTheme = getOperixNavigationTheme(isDark, brand.primary);
  return <OperixMobileAppShell product="booking"><NavigationContainer theme={navigationTheme}><BookingMobileProvider><AppNavigator /></BookingMobileProvider><StatusBar style={isDark ? 'light' : 'dark'} /></NavigationContainer></OperixMobileAppShell>;
}

export function App() {
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
  if (!fontsLoaded) return null;
  return <ThemeProvider><AuthProvider><SafeAreaProvider><AppContent /></SafeAreaProvider></AuthProvider></ThemeProvider>;
}
