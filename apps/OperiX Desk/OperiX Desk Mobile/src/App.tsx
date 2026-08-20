import React from 'react';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, useFonts } from '@expo-google-fonts/poppins';
import { AuthProvider, ThemeProvider } from '@invoice-monorepo/context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OperixMobileAppShell } from '@invoice-monorepo/ui';
import { AppNavigator } from './navigation/AppNavigator';

export function App() {
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const setTitle = () => { document.title = 'OperiX Desk'; };
    setTitle();
    const timer = setTimeout(setTitle, 0);
    return () => clearTimeout(timer);
  }, []);
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <SafeAreaProvider>
            <OperixMobileAppShell product="desk"><AppNavigator /></OperixMobileAppShell>
          </SafeAreaProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
