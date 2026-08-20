import React from 'react';
import { Platform, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';
import { getOperixPalette, operixMobileTokens } from './tokens';

export function getOperixNavigationTheme(isDark: boolean, primaryColor: string = operixMobileTokens.colors.primary): Theme {
    const palette = getOperixPalette(isDark, primaryColor);
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
        ...base,
        colors: {
            ...base.colors,
            primary: palette.primary,
            background: palette.background,
            card: palette.surface,
            text: palette.text,
            border: palette.border,
            notification: palette.primary,
        },
    };
}

export function getOperixBottomTabBarStyle(isDark: boolean, style?: StyleProp<ViewStyle>) {
    const palette = getOperixPalette(isDark);
    return [styles.tabBar, { backgroundColor: palette.surface, borderTopColor: palette.border }, style] as StyleProp<ViewStyle>;
}

export function getOperixBottomNavigationOptions(isDark: boolean, primaryColor: string = operixMobileTokens.colors.primary) {
    const palette = getOperixPalette(isDark, primaryColor);
    return {
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: getOperixBottomTabBarStyle(isDark),
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: { fontSize: 10, lineHeight: 14, fontFamily: operixMobileTokens.typography.fontFamily.medium },
        tabBarIconStyle: { marginTop: 2 },
    };
}

/** Use as `tabBar={OperixBottomNavigation}` on every OperiX bottom tab navigator. */
export function OperixBottomNavigation(props: BottomTabBarProps) {
    // React Navigation invokes the `tabBar` callback directly rather than
    // rendering it as a component. Hooks here therefore run outside a React
    // component body and trigger React's invalid-hook-call error. The current
    // tab's `tabBarStyle` is already supplied through screen options.
    return <BottomTabBar {...props} />;
}

const styles = StyleSheet.create({
    tabBar: {
        borderTopWidth: 1,
        paddingTop: 7,
        paddingBottom: Platform.OS === 'ios' ? 23 : 8,
        height: Platform.OS === 'ios' ? operixMobileTokens.layout.bottomNavigationHeightIOS : operixMobileTokens.layout.bottomNavigationHeightAndroid,
        paddingHorizontal: 8,
        elevation: 0,
    },
});
