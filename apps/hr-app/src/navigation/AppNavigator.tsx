import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet, Platform, Text } from 'react-native';
import {
    LayoutDashboard,
    Users,
    Clock,
    Wallet,
    Settings,
    ShieldAlert,
    Fingerprint,
} from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { Button } from '@invoice-monorepo/ui';
import { t } from '@invoice-monorepo/i18n';

// Auth Screens
import { SignInScreen } from '../screens/Auth/SignInScreen';
import { SignUpScreen } from '../screens/Auth/SignUpScreen';
import { JoinTeamScreen } from '../screens/Auth/JoinTeamScreen';
import { ApprovalPendingScreen } from '../screens/Auth/ApprovalPendingScreen';

// HR Dashboard
import { HRDashboardScreen, JoinRequestsScreen } from '../screens/HR';

// Employee Screens
import { EmployeeDirectoryScreen } from '../screens/Employees/EmployeeDirectoryScreen';
import { EmployeeFormScreen } from '../screens/Employees/EmployeeFormScreen';
import { EmployeeVaultScreen } from '../screens/Employees/EmployeeVaultScreen';

// Time & Attendance
import { AttendanceScreen } from '../screens/Time/AttendanceScreen';
import { LeaveRequestScreen } from '../screens/Time/LeaveRequestScreen';
import { ScheduleScreen } from '../screens/Time/ScheduleScreen';
import { ShiftFormScreen } from '../screens/Time/ShiftFormScreen';

// Payroll
import { PayrollDashboardScreen } from '../screens/Payroll/PayrollDashboardScreen';
import { PayrollDetailScreen } from '../screens/Payroll/PayrollDetailScreen';
import { ComplianceScreen } from '../screens/Payroll/ComplianceScreen';
import { ComplianceFormScreen } from '../screens/Payroll/ComplianceFormScreen';

// Settings
import { SettingsScreen } from '../screens/Settings/SettingsScreen';
import { ManageCompaniesScreen } from '../screens/Settings/ManageCompaniesScreen';
import { AdvancedSettingsScreen } from '../screens/Settings/AdvancedSettingsScreen';

// Profile
import { ProfileScreen } from '../screens/Profile/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const CustomDarkTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        primary: '#818cf8',
        background: '#0f172a',
        card: '#1e293b',
        text: '#ffffff',
        border: '#334155',
        notification: '#818cf8',
    },
};

const CustomLightTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        primary: '#6366f1',
        background: '#f8fafc',
        card: '#ffffff',
        text: '#1e293b',
        border: '#e2e8f0',
        notification: '#6366f1',
    },
};

function BiometricOverlay({ onAuthenticated }: { onAuthenticated: () => void }) {
    const { isDark } = useTheme();
    const [authenticating, setAuthenticating] = useState(false);

    const authenticate = async () => {
        setAuthenticating(true);
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock HR App',
            fallbackLabel: 'Use Passcode',
        });
        setAuthenticating(false);
        if (result.success) onAuthenticated();
    };

    useEffect(() => {
        authenticate();
    }, []);

    return (
        <View style={[styles.lockContainer, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}>
            <View style={styles.lockIconContainer}>
                <ShieldAlert color="#818cf8" size={64} />
            </View>
            <Text style={[styles.lockTitle, { color: isDark ? '#fff' : '#1e293b' }]}>App Locked</Text>
            <Text style={[styles.lockText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                Please verify your identity to continue.
            </Text>
            <Button
                title={authenticating ? "Authenticating..." : "Unlock with Biometrics"}
                onPress={authenticate}
                icon={Fingerprint}
                style={{ width: '80%', marginTop: 24 }}
            />
        </View>
    );
}

function EmployeesStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="EmployeeDirectory" component={EmployeeDirectoryScreen} />
            <Stack.Screen name="EmployeeForm" component={EmployeeFormScreen} />
            <Stack.Screen name="EmployeeVault" component={EmployeeVaultScreen} />
            <Stack.Screen name="JoinRequests" component={JoinRequestsScreen} />
        </Stack.Navigator>
    );
}

function TimeStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="AttendanceMain" component={AttendanceScreen} />
            <Stack.Screen name="LeaveRequests" component={LeaveRequestScreen} />
            <Stack.Screen name="Schedule" component={ScheduleScreen} />
            <Stack.Screen name="ShiftForm" component={ShiftFormScreen} />
        </Stack.Navigator>
    );
}

function PayrollStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PayrollDashboard" component={PayrollDashboardScreen} />
            <Stack.Screen name="PayrollDetail" component={PayrollDetailScreen} />
            <Stack.Screen name="Compliance" component={ComplianceScreen} />
            <Stack.Screen name="ComplianceForm" component={ComplianceFormScreen} />
        </Stack.Navigator>
    );
}

function SettingsStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SettingsMain" component={SettingsScreen} />
            <Stack.Screen name="ManageCompanies" component={ManageCompaniesScreen} />
            <Stack.Screen name="AdvancedSettings" component={AdvancedSettingsScreen} />
        </Stack.Navigator>
    );
}

function MainTabs() {
    const { isDark, language, primaryColor } = useTheme();

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    borderTopColor: isDark ? '#334155' : '#e2e8f0',
                    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
                    paddingTop: 8,
                    height: Platform.OS === 'ios' ? 88 : 70,
                    paddingHorizontal: 8,
                },
                tabBarActiveTintColor: primaryColor,
                tabBarInactiveTintColor: isDark ? '#64748b' : '#94a3b8',
                tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
                tabBarIconStyle: { marginTop: 4 },
            }}
        >
            <Tab.Screen name="Dashboard" component={HRDashboardScreen} options={{ tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={22} />, tabBarLabel: t('dashboard', language) }} />
            <Tab.Screen name="EmployeesTab" component={EmployeesStack} options={{ tabBarIcon: ({ color }) => <Users color={color} size={22} />, tabBarLabel: 'Employees' }} />
            <Tab.Screen name="TimeTab" component={TimeStack} options={{ tabBarIcon: ({ color }) => <Clock color={color} size={22} />, tabBarLabel: 'Time' }} />
            <Tab.Screen name="PayrollTab" component={PayrollStack} options={{ tabBarIcon: ({ color }) => <Wallet color={color} size={22} />, tabBarLabel: 'Payroll' }} />
        </Tab.Navigator>
    );
}

function RootStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Settings" component={SettingsStack} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
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
            <Stack.Screen name="JoinTeam" component={JoinTeamScreen} />
        </Stack.Navigator>
    );
}

export function AppNavigator() {
    const { user, loading: authLoading } = useAuth();
    const { isDark } = useTheme();
    const [isLocked, setIsLocked] = useState(false);
    const [checkingLock, setCheckingLock] = useState(true);
    const [isPending, setIsPending] = useState(false);

    useEffect(() => {
        if (user) {
            checkUserStatus();
        } else {
            setIsLocked(false);
            setIsPending(false);
            setCheckingLock(false);
        }
    }, [user]);

    const checkUserStatus = async () => {
        try {
            // Check Biometrics
            const { data: profile } = await supabase.from('profiles').select('biometric_enabled').eq('id', user?.id).single();
            if (profile?.biometric_enabled) {
                setIsLocked(true);
            }

            // Check Employment Status
            const { data: employeeData } = await supabase
                .from('employees')
                .select('status')
                .eq('user_id', user?.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (employeeData && employeeData.status === 'pending') {
                setIsPending(true);
            } else {
                setIsPending(false);
            }

        } catch (error) {
            console.error('Error checking status:', error);
        } finally {
            setCheckingLock(false);
        }
    };

    if (authLoading || checkingLock) {
        return (
            <View style={[styles.loading, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}>
                <ActivityIndicator size="large" color="#818cf8" />
            </View>
        );
    }

    if (user && isPending) {
        return (
            <NavigationContainer theme={isDark ? CustomDarkTheme : CustomLightTheme}>
                <ApprovalPendingScreen />
            </NavigationContainer>
        );
    }

    if (user && isLocked) {
        return (
            <NavigationContainer theme={isDark ? CustomDarkTheme : CustomLightTheme}>
                <BiometricOverlay onAuthenticated={() => setIsLocked(false)} />
            </NavigationContainer>
        );
    }

    return (
        <NavigationContainer theme={isDark ? CustomDarkTheme : CustomLightTheme}>
            {user ? <RootStack /> : <AuthStack />}
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    lockContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    lockIconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(129, 140, 248, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    lockTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
    lockText: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 }
});





