import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import {
    House,
    Users,
    Clock3,
    CalendarDays,
    MoreHorizontal,
    ShieldAlert,
    Fingerprint,
} from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { Button, getOperixBottomNavigationOptions, getOperixNavigationTheme, OperixBottomNavigation } from '@invoice-monorepo/ui';
import { brand, getPalette } from '../theme/brand';
import { OperixLogo } from '../components/OperixLogo';
import { MoreScreen } from '../screens/More/MoreScreen';

// Auth Screens
import { SignInScreen } from '../screens/Auth/SignInScreen';
import { SignUpScreen } from '../screens/Auth/SignUpScreen';
import { JoinTeamScreen } from '../screens/Auth/JoinTeamScreen';
import { ApprovalPendingScreen } from '../screens/Auth/ApprovalPendingScreen';

// HR Dashboard
import { ApprovalsScreen, HRDashboardScreen, HrOperationsScreen, JoinRequestsScreen } from '../screens/HR';

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

const CustomDarkTheme = getOperixNavigationTheme(true);
const CustomLightTheme = getOperixNavigationTheme(false);

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

    const palette = getPalette(isDark);

    return (
        <View style={[styles.lockContainer, { backgroundColor: palette.background }]}>
            <OperixLogo width={180} reversed={isDark} />
            <View style={[styles.lockIconContainer, { backgroundColor: palette.iconSurface }]}>
                <ShieldAlert color={brand.colors.primary} size={52} />
            </View>
            <Text style={[styles.lockTitle, { color: palette.text }]}>App Locked</Text>
            <Text style={[styles.lockText, { color: palette.muted }]}>
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
        <Stack.Navigator id="employees-stack" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="EmployeeDirectory" component={EmployeeDirectoryScreen} />
            <Stack.Screen name="EmployeeForm" component={EmployeeFormScreen} />
            <Stack.Screen name="EmployeeVault" component={EmployeeVaultScreen} />
            <Stack.Screen name="JoinRequests" component={JoinRequestsScreen} />
        </Stack.Navigator>
    );
}

function TimeStack() {
    return (
        <Stack.Navigator id="time-stack" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="AttendanceMain" component={AttendanceScreen} />
            <Stack.Screen name="LeaveRequests" component={LeaveRequestScreen} />
            <Stack.Screen name="Schedule" component={ScheduleScreen} />
            <Stack.Screen name="ShiftForm" component={ShiftFormScreen} />
        </Stack.Navigator>
    );
}

function PayrollStack() {
    return (
        <Stack.Navigator id="payroll-stack" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PayrollDashboard" component={PayrollDashboardScreen} />
            <Stack.Screen name="PayrollDetail" component={PayrollDetailScreen} />
            <Stack.Screen name="Compliance" component={ComplianceScreen} />
            <Stack.Screen name="ComplianceForm" component={ComplianceFormScreen} />
        </Stack.Navigator>
    );
}

function SettingsStack() {
    return (
        <Stack.Navigator id="settings-stack" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SettingsMain" component={SettingsScreen} />
            <Stack.Screen name="ManageCompanies" component={ManageCompaniesScreen} />
            <Stack.Screen name="AdvancedSettings" component={AdvancedSettingsScreen} />
        </Stack.Navigator>
    );
}

function MoreStack() {
    return <Stack.Navigator id="more-stack" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MoreHome" component={MoreScreen} />
        <Stack.Screen name="Payroll" component={PayrollStack} />
        <Stack.Screen name="Approvals" component={ApprovalsScreen} />
        <Stack.Screen name="Recruitment" component={HrOperationsScreen} initialParams={{ mode: 'recruitment' }} />
        <Stack.Screen name="Performance" component={HrOperationsScreen} initialParams={{ mode: 'performance' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Settings" component={SettingsStack} />
    </Stack.Navigator>;
}

function MainTabs() {
    const { isDark, primaryColor } = useTheme();

    return (
        <Tab.Navigator id="main-tabs" tabBar={OperixBottomNavigation}
            screenOptions={{ ...getOperixBottomNavigationOptions(isDark, primaryColor) }}
        >
            <Tab.Screen name="Dashboard" component={HRDashboardScreen} options={{ tabBarIcon: ({ color }) => <House color={color} size={21} />, tabBarLabel: 'Home' }} />
            <Tab.Screen name="EmployeesTab" component={EmployeesStack} options={{ tabBarIcon: ({ color }) => <Users color={color} size={21} />, tabBarLabel: 'People' }} />
            <Tab.Screen name="Attendance" component={AttendanceScreen} options={{ tabBarIcon: ({ color }) => <Clock3 color={color} size={21} />, tabBarLabel: 'Time' }} />
            <Tab.Screen name="Leave" component={LeaveRequestScreen} options={{ tabBarIcon: ({ color }) => <CalendarDays color={color} size={22} />, tabBarLabel: 'Leave' }} />
            <Tab.Screen name="MoreTab" component={MoreStack} options={{ tabBarIcon: ({ color }) => <MoreHorizontal color={color} size={22} />, tabBarLabel: 'More' }} />
        </Tab.Navigator>
    );
}

function RootStack() {
    return (
        <Stack.Navigator id="root-stack" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Settings" component={SettingsStack} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
    );
}

function AuthStack() {
    return (
        <Stack.Navigator id="auth-stack" screenOptions={{ headerShown: false }}>
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
            <View style={[styles.loading, { backgroundColor: getPalette(isDark).background }]}>
                <OperixLogo width={180} reversed={isDark} />
                <ActivityIndicator size="small" color={brand.colors.primary} style={styles.loadingIndicator} />
                <Text style={[styles.loadingText, { color: getPalette(isDark).muted }]}>Opening your workspace</Text>
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
    loadingIndicator: { marginTop: 24 },
    loadingText: { marginTop: 10, fontSize: 13, fontFamily: brand.fonts.regular },
    lockContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    lockIconContainer: { width: 104, height: 104, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginTop: 34, marginBottom: 24 },
    lockTitle: { fontSize: 24, fontFamily: brand.fonts.semibold, marginBottom: 12 },
    lockText: { fontSize: 14, fontFamily: brand.fonts.regular, textAlign: 'center', lineHeight: 22, marginBottom: 32 }
});
