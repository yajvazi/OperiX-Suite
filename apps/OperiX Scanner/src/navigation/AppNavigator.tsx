import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { ScanLine } from 'lucide-react-native';

import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { getOperixNavigationTheme, OperixEmptyState, OperixLoadingState, OperixScreen, operixMobileTokens } from '@invoice-monorepo/ui';
import { SignInScreen } from '../screens/Auth/SignInScreen';
import { SignUpScreen } from '../screens/Auth/SignUpScreen';

const Stack = createNativeStackNavigator();

function PlaceholderScreen() {
    return <OperixScreen edges={['top', 'bottom']}><View style={styles.placeholder}><OperixEmptyState title="OperiX Scanner" description="Scan invoices, receipts, and documents with AI-powered extraction." icon={ScanLine} /></View></OperixScreen>;
}

function AuthStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SignIn">
                {(props: any) => (
                    <SignInScreen
                        onNavigateToSignUp={() => props.navigation.navigate('SignUp')}
                    />
                )}
            </Stack.Screen>
            <Stack.Screen name="SignUp">
                {(props: any) => (
                    <SignUpScreen
                        onNavigateToSignIn={() => props.navigation.navigate('SignIn')}
                        navigation={props.navigation}
                    />
                )}
            </Stack.Screen>
        </Stack.Navigator>
    );
}

export function AppNavigator() {
    const { user, loading: authLoading } = useAuth();
    const { isDark, primaryColor } = useTheme();

    if (authLoading) {
        return (
            <OperixScreen edges={['top', 'bottom']}><OperixLoadingState /></OperixScreen>
        );
    }

    return (
        <NavigationContainer theme={getOperixNavigationTheme(isDark, primaryColor)}>
            {user ? <PlaceholderScreen /> : <AuthStack />}
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: operixMobileTokens.layout.screenPadding },
});



