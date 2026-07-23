import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '@invoice-monorepo/hooks';

export function ProfileScreen({ navigation }: any) {
    const { isDark } = useTheme();

    useEffect(() => {
        // Redirect to Settings -> SettingsMain
        navigation.replace('Settings', { screen: 'SettingsMain' });
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#0D1B2A' : '#F7F9FC', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#004FFE" />
        </View>
    );
}





