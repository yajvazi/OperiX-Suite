import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { MapPin } from 'lucide-react-native';

import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { SignInScreen } from '../screens/Auth/SignInScreen';
import { SignUpScreen } from '../screens/Auth/SignUpScreen';

const Stack = createNativeStackNavigator();

const CustomDarkTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        primary: '#f59e0b',
        background: '#0f172a',
        card: '#1e293b',
        text: '#ffffff',
        border: '#334155',
        notification: '#f59e0b',
    },
};

const CustomLightTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        primary: '#d97706',
        background: '#f8fafc',
        card: '#ffffff',
        text: '#1e293b',
        border: '#e2e8f0',
        notification: '#d97706',
    },
};

function PlaceholderScreen() {
    const { isDark } = useTheme();
    return (
        <View style={[styles.placeholder, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}>
            <View style={styles.iconContainer}>
                <MapPin color="#f59e0b" size={64} />
            </View>
            <Text style={[styles.title, { color: isDark ? '#fff' : '#1e293b' }]}>OperiX Tracker</Text>
            <Text style={[styles.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                Coming Soon
            </Text>
            <Text style={[styles.description, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                Track time, location, and mileage for employees and field workers.
            </Text>
        </View>
    );
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
    const { isDark } = useTheme();

    if (authLoading) {
        return (
            <View style={[styles.loading, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}>
                <ActivityIndicator size="large" color="#f59e0b" />
            </View>
        );
    }

    return (
        <NavigationContainer theme={isDark ? CustomDarkTheme : CustomLightTheme}>
            {user ? <PlaceholderScreen /> : <AuthStack />}
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    iconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(245, 158, 11, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
    subtitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
    description: { fontSize: 14, textAlign: 'center', lineHeight: 22 }
});





