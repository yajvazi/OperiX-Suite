import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
    BriefcaseBusiness,
    Fingerprint,
    FileText,
    House,
    MoreHorizontal,
    ReceiptText,
    ShieldAlert,
} from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { t } from '@invoice-monorepo/i18n';
import { Button, getOperixBottomNavigationOptions, getOperixNavigationTheme, OperixBottomNavigation } from '@invoice-monorepo/ui';
import { OperixLogo } from '../components/OperixLogo';
import { brand } from '../theme/brand';
import type {
    AuthStackParamList,
    LegacyExpensesStackParamList,
    LegacyInvoicesStackParamList,
    LegacyManagementStackParamList,
    MainTabParamList,
    RootStackParamList,
    SettingsStackParamList,
} from './types';

import { SignInScreen } from '../screens/Auth/SignInScreen';
import { SignUpScreen } from '../screens/Auth/SignUpScreen';
import { JoinTeamScreen } from '../screens/Auth/JoinTeamScreen';
import { ApprovalPendingScreen } from '../screens/Auth/ApprovalPendingScreen';

import { HomeScreen } from '../screens/Home/HomeScreen';
import { SalesScreen } from '../screens/Sales/SalesScreen';
import { POSScreen } from '../screens/POS/POSScreen';
import { BusinessScreen } from '../screens/Business/BusinessScreen';
import { MoreScreen } from '../screens/More/MoreScreen';
import { GlobalSearchScreen } from '../screens/Search/GlobalSearchScreen';
import { AccountingScreen } from '../screens/Accounting/AccountingScreen';
import { AccountantReportScreen } from '../screens/Accounting/AccountantReportScreen';
import { CustomerDetailScreen } from '../screens/Customers/CustomerDetailScreen';
import { ProductDetailScreen } from '../screens/Products/ProductDetailScreen';

import { DashboardScreen } from '../screens/Dashboard/DashboardScreen';
import { PayrollScreen } from '../screens/Payroll/PayrollScreen';
import { PayrollSetupScreen } from '../screens/Payroll/PayrollSetupScreen';
import { InvoicesScreen } from '../screens/Invoices/InvoicesScreen';
import { InvoiceFormScreen } from '../screens/Invoices/InvoiceFormScreen';
import { InvoiceDetailScreen } from '../screens/Invoices/InvoiceDetailScreen';
import { QRScannerScreen } from '../screens/Invoices/QRScannerScreen';
import { FaturatScreen } from '../screens/Invoices/FaturatScreen';
import { AllInvoicesScreen } from '../screens/Invoices/AllInvoicesScreen';
import { ManagementScreen } from '../screens/Management/ManagementScreen';
import { ManagementDashboardScreen } from '../screens/Management/ManagementDashboardScreen';
import { ClientsScreen } from '../screens/Clients/ClientsScreen';
import { ClientFormScreen } from '../screens/Clients/ClientFormScreen';
import { ProductsScreen } from '../screens/Products/ProductsScreen';
import { ProductFormScreen } from '../screens/Products/ProductFormScreen';
import { VendorFormScreen, VendorsScreen, SupplierBillFormScreen, SupplierBillsListScreen, ScanBillScreen } from '../screens/Vendors';
import { VendorPaymentFormScreen, VendorPaymentsListScreen } from '../screens/VendorPayments';
import { PaymentFormScreen, PaymentsListScreen } from '../screens/Payments';
import { CustomerLedgerScreen } from '../screens/Reports/CustomerLedgerScreen';
import { VendorLedgerScreen } from '../screens/Reports/VendorLedgerScreen';
import { ReportPreviewScreen } from '../screens/Reports/ReportPreviewScreen';
import { SalesBookScreen } from '../screens/Reports/SalesBookScreen';
import { ReportsHubScreen } from '../screens/Reports/ReportsHubScreen';
import { CashBalancesScreen } from '../screens/Reports/CashBalancesScreen';
import { AgentActivityScreen } from '../screens/Reports/AgentActivityScreen';
import { TaxCenterScreen } from '../screens/TaxCenter/TaxCenterScreen';
import { ContractFormScreen } from '../screens/Contracts/ContractFormScreen';
import { ContractDetailScreen } from '../screens/Contracts/ContractDetailScreen';
import { ExpensesScreen } from '../screens/Expenses/ExpensesScreen';
import { ExpenseFormScreen } from '../screens/Expenses/ExpenseFormScreen';
import { ExpensesDashboardScreen } from '../screens/Expenses/ExpensesDashboardScreen';
import { ExpensesListScreen } from '../screens/Expenses/ExpensesListScreen';
import { SettingsScreen } from '../screens/Settings/SettingsScreen';
import { TemplateEditorScreen } from '../screens/Settings/TemplateEditorScreen';
import { ContractTemplatesScreen } from '../screens/Settings/Contracts/ContractTemplatesScreen';
import { ContractTemplateEditorScreen } from '../screens/Settings/Contracts/ContractTemplateEditorScreen';
import { InvoiceTemplateSettingsScreen } from '../screens/Settings/Templates/InvoiceTemplateSettingsScreen';
import { PaymentIntegrationsScreen } from '../screens/Settings/PaymentIntegrationsScreen';
import { StripeDashboardScreen } from '../screens/Settings/StripeDashboardScreen';
import { ManageCompaniesScreen } from '../screens/Settings/ManageCompaniesScreen';
import { AdvancedSettingsScreen } from '../screens/Settings/AdvancedSettingsScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';
import { HelpSupportScreen } from '../screens/Support/HelpSupportScreen';
import { HelpCategoryScreen } from '../screens/Support/HelpCategoryScreen';
import { HelpArticleScreen } from '../screens/Support/HelpArticleScreen';
import { AboutScreen } from '../screens/About/AboutScreen';
import { OperixAIScreen } from '../screens/AI/OperixAIScreen';
import { NotificationsScreen } from '../screens/Notifications/NotificationsScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const InvoicesStack = createNativeStackNavigator<LegacyInvoicesStackParamList>();
const ManagementStack = createNativeStackNavigator<LegacyManagementStackParamList>();
const ExpensesStack = createNativeStackNavigator<LegacyExpensesStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const CustomDarkTheme = getOperixNavigationTheme(true);
const CustomLightTheme = getOperixNavigationTheme(false);

function BiometricOverlay({ onAuthenticated }: { onAuthenticated: () => void }) {
    const { isDark, language } = useTheme();
    const [authenticating, setAuthenticating] = useState(false);

    const authenticate = async () => {
        setAuthenticating(true);
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: t('unlockOperixInvoice', language),
            fallbackLabel: t('usePasscode', language),
        });
        setAuthenticating(false);
        if (result.success) onAuthenticated();
    };

    useEffect(() => { void authenticate(); }, []);

    return (
        <View style={[styles.lockContainer, { backgroundColor: isDark ? brand.colors.navySoft : brand.colors.background }]}>
            <View style={styles.lockIconContainer}><ShieldAlert color={brand.colors.primary} size={58} /></View>
            <Text style={[styles.lockTitle, { color: isDark ? '#fff' : brand.colors.text }]}>{t('appLocked', language)}</Text>
            <Text style={[styles.lockText, { color: isDark ? '#94a3b8' : brand.colors.muted }]}>{t('verifyIdentity', language)}</Text>
            <Button title={authenticating ? t('authenticating', language) : t('unlockWithBiometrics', language)} onPress={() => void authenticate()} icon={Fingerprint} style={{ width: '80%', marginTop: 24 }} />
        </View>
    );
}

function LegacyInvoicesNavigator() {
    return <InvoicesStack.Navigator id="legacy-invoices" screenOptions={{ headerShown: false }}>
        <InvoicesStack.Screen name="FaturatMain" component={FaturatScreen} />
        <InvoicesStack.Screen name="InvoicesList" component={InvoicesScreen} />
        <InvoicesStack.Screen name="AllInvoices" component={AllInvoicesScreen} />
        <InvoicesStack.Screen name="InvoiceForm" component={InvoiceFormScreen} />
        <InvoicesStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
        <InvoicesStack.Screen name="ContractForm" component={ContractFormScreen} />
        <InvoicesStack.Screen name="ContractDetail" component={ContractDetailScreen} />
        <InvoicesStack.Screen name="ReportPreview" component={ReportPreviewScreen} />
        <InvoicesStack.Screen name="SalesBook" component={SalesBookScreen} />
        <InvoicesStack.Screen name="PaymentForm" component={PaymentFormScreen} />
        <InvoicesStack.Screen name="PaymentsList" component={PaymentsListScreen} />
        <InvoicesStack.Screen name="ClientForm" component={ClientFormScreen} />
        <InvoicesStack.Screen name="CustomerLedger" component={CustomerLedgerScreen} />
        <InvoicesStack.Screen name="VendorLedger" component={VendorLedgerScreen} />
        <InvoicesStack.Screen name="VendorForm" component={VendorFormScreen} />
        <InvoicesStack.Screen name="VendorsList" component={VendorsScreen} />
        <InvoicesStack.Screen name="VendorPaymentForm" component={VendorPaymentFormScreen} />
        <InvoicesStack.Screen name="VendorPaymentsList" component={VendorPaymentsListScreen} />
        <InvoicesStack.Screen name="SupplierBillForm" component={SupplierBillFormScreen} />
        <InvoicesStack.Screen name="SupplierBillsList" component={SupplierBillsListScreen} />
        <InvoicesStack.Screen name="ScanBill" component={ScanBillScreen} />
        <InvoicesStack.Screen name="ExpenseForm" component={ExpenseFormScreen} />
    </InvoicesStack.Navigator>;
}

function LegacyManagementNavigator() {
    return <ManagementStack.Navigator id="legacy-management" screenOptions={{ headerShown: false }}>
        <ManagementStack.Screen name="ManagementTabs" component={ManagementScreen} />
        <ManagementStack.Screen name="ManagementDashboard" component={ManagementDashboardScreen} />
        <ManagementStack.Screen name="ClientsList" component={ClientsScreen} />
        <ManagementStack.Screen name="ProductsList" component={ProductsScreen} />
        <ManagementStack.Screen name="VendorsList" component={VendorsScreen} />
        <ManagementStack.Screen name="ExpenseForm" component={ExpenseFormScreen} />
        <ManagementStack.Screen name="ExpensesList" component={ExpensesScreen} />
        <ManagementStack.Screen name="ClientForm" component={ClientFormScreen} />
        <ManagementStack.Screen name="ProductForm" component={ProductFormScreen} />
        <ManagementStack.Screen name="VendorForm" component={VendorFormScreen} />
        <ManagementStack.Screen name="VendorPaymentForm" component={VendorPaymentFormScreen} />
        <ManagementStack.Screen name="CustomerLedger" component={CustomerLedgerScreen} />
        <ManagementStack.Screen name="VendorLedger" component={VendorLedgerScreen} />
    </ManagementStack.Navigator>;
}

function LegacyExpensesNavigator() {
    return <ExpensesStack.Navigator id="legacy-expenses" screenOptions={{ headerShown: false }}>
        <ExpensesStack.Screen name="ExpensesDashboard" component={ExpensesDashboardScreen} />
        <ExpensesStack.Screen name="ExpensesList" component={ExpensesListScreen} />
        <ExpensesStack.Screen name="ExpenseForm" component={ExpenseFormScreen} />
    </ExpensesStack.Navigator>;
}

function SettingsNavigator() {
    return <SettingsStack.Navigator id="settings-stack" screenOptions={{ headerShown: false }}>
        <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
        <SettingsStack.Screen name="TemplateEditor" component={TemplateEditorScreen} />
        <SettingsStack.Screen name="ContractTemplates" component={ContractTemplatesScreen} />
        <SettingsStack.Screen name="ContractTemplateEditor" component={ContractTemplateEditorScreen} />
        <SettingsStack.Screen name="InvoiceTemplateSettings" component={InvoiceTemplateSettingsScreen} />
        <SettingsStack.Screen name="PaymentIntegrations" component={PaymentIntegrationsScreen} />
        <SettingsStack.Screen name="StripeDashboard" component={StripeDashboardScreen} />
        <SettingsStack.Screen name="ManageCompanies" component={ManageCompaniesScreen} />
        <SettingsStack.Screen name="AdvancedSettings" component={AdvancedSettingsScreen} />
    </SettingsStack.Navigator>;
}

function MainTabs() {
    const { isDark, primaryColor, language } = useTheme();
    return <Tab.Navigator id="main-tabs" initialRouteName="Home" tabBar={OperixBottomNavigation} screenOptions={{
        ...getOperixBottomNavigationOptions(isDark, primaryColor),
    }}>
        <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('homeTab', language), tabBarAccessibilityLabel: t('homeTab', language), tabBarButtonTestID: 'nav-home-tab', tabBarIcon: ({ color }) => <House color={color} size={21} /> }} />
        <Tab.Screen name="Sales" component={SalesScreen} options={{ tabBarLabel: t('sales', language), tabBarAccessibilityLabel: t('sales', language), tabBarButtonTestID: 'nav-sales-tab', tabBarIcon: ({ color }) => <ReceiptText color={color} size={21} /> }} />
        <Tab.Screen name="POS" component={POSScreen} options={{ tabBarLabel: t('posTab', language), tabBarAccessibilityLabel: t('posTab', language), tabBarButtonTestID: 'nav-pos-tab', tabBarIcon: ({ color }) => <FileText color={color} size={21} /> }} />
        <Tab.Screen name="Business" component={BusinessScreen} options={{ tabBarLabel: t('business', language), tabBarAccessibilityLabel: t('business', language), tabBarButtonTestID: 'nav-business-tab', tabBarIcon: ({ color }) => <BriefcaseBusiness color={color} size={21} /> }} />
        <Tab.Screen name="More" component={MoreScreen} options={{ tabBarLabel: t('more', language), tabBarAccessibilityLabel: t('more', language), tabBarButtonTestID: 'nav-more-tab', tabBarIcon: ({ color }) => <MoreHorizontal color={color} size={22} /> }} />
    </Tab.Navigator>;
}

function RootNavigator() {
    return <RootStack.Navigator id="root-stack" screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={MainTabs} />
        <RootStack.Screen name="GlobalSearch" component={GlobalSearchScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="OperixAI" component={OperixAIScreen} />
        <RootStack.Screen name="Notifications" component={NotificationsScreen} />
        <RootStack.Screen name="Accounting" component={AccountingScreen} />
        <RootStack.Screen name="AccountantReport" component={AccountantReportScreen} />
        <RootStack.Screen name="Payroll" component={PayrollScreen} />
        <RootStack.Screen name="PayrollSetup" component={PayrollSetupScreen} />
        <RootStack.Screen name="ReportsHub" component={ReportsHubScreen} />
        <RootStack.Screen name="CashBalances" component={CashBalancesScreen} />
        <RootStack.Screen name="AgentActivity" component={AgentActivityScreen} />
        <RootStack.Screen name="TaxCenter" component={TaxCenterScreen} />
        <RootStack.Screen name="QRScanner" component={QRScannerScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="Settings" component={SettingsNavigator} />
        <RootStack.Screen name="ContractTemplates" component={ContractTemplatesScreen} />
        <RootStack.Screen name="Profile" component={ProfileScreen} />
        <RootStack.Screen name="HelpSupport" component={HelpSupportScreen} />
        <RootStack.Screen name="HelpCategory" component={HelpCategoryScreen} />
        <RootStack.Screen name="HelpArticle" component={HelpArticleScreen} />
        <RootStack.Screen name="About" component={AboutScreen} />

        <RootStack.Screen name="InvoiceForm" component={InvoiceFormScreen} />
        <RootStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
        <RootStack.Screen name="InvoicesList" component={InvoicesScreen} />
        <RootStack.Screen name="AllInvoices" component={AllInvoicesScreen} />
        <RootStack.Screen name="PaymentsList" component={PaymentsListScreen} />
        <RootStack.Screen name="PaymentForm" component={PaymentFormScreen} />
        <RootStack.Screen name="ClientForm" component={ClientFormScreen} />
        <RootStack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
        <RootStack.Screen name="ProductsList" component={ProductsScreen} />
        <RootStack.Screen name="ProductForm" component={ProductFormScreen} />
        <RootStack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <RootStack.Screen name="ExpenseForm" component={ExpenseFormScreen} />
        <RootStack.Screen name="ExpensesList" component={ExpensesScreen} />
        <RootStack.Screen name="VendorsList" component={VendorsScreen} />
        <RootStack.Screen name="VendorForm" component={VendorFormScreen} />
        <RootStack.Screen name="VendorLedger" component={VendorLedgerScreen} />
        <RootStack.Screen name="CustomerLedger" component={CustomerLedgerScreen} />
        <RootStack.Screen name="VendorPaymentForm" component={VendorPaymentFormScreen} />
        <RootStack.Screen name="VendorPaymentsList" component={VendorPaymentsListScreen} />
        <RootStack.Screen name="SupplierBillForm" component={SupplierBillFormScreen} />
        <RootStack.Screen name="SupplierBillsList" component={SupplierBillsListScreen} />
        <RootStack.Screen name="ScanBill" component={ScanBillScreen} />
        <RootStack.Screen name="ContractForm" component={ContractFormScreen} />
        <RootStack.Screen name="ContractDetail" component={ContractDetailScreen} />
        <RootStack.Screen name="ReportPreview" component={ReportPreviewScreen} />
        <RootStack.Screen name="SalesBook" component={SalesBookScreen} />

        {/* Compatibility navigators; these are no longer bottom-navigation destinations. */}
        <RootStack.Screen name="InvoicesTab" component={LegacyInvoicesNavigator} />
        <RootStack.Screen name="Management" component={LegacyManagementNavigator} />
    </RootStack.Navigator>;
}

function AuthNavigator() {
    return <AuthStack.Navigator id="auth-stack" screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="SignIn">{(props) => <SignInScreen onNavigateToSignUp={() => props.navigation.navigate('SignUp')} />}</AuthStack.Screen>
        <AuthStack.Screen name="SignUp">{(props) => <SignUpScreen onNavigateToSignIn={() => props.navigation.navigate('SignIn')} navigation={props.navigation} />}</AuthStack.Screen>
        <AuthStack.Screen name="JoinTeam" component={JoinTeamScreen} />
    </AuthStack.Navigator>;
}

export function AppNavigator() {
    const { user, loading: authLoading } = useAuth();
    const { isDark, language } = useTheme();
    const [isLocked, setIsLocked] = useState(false);
    const [checkingLock, setCheckingLock] = useState(true);
    const [isPending, setIsPending] = useState(false);

    useEffect(() => {
        if (user) {
            void checkUserStatus();
        } else {
            setIsLocked(false);
            setIsPending(false);
            setCheckingLock(false);
        }
    }, [user?.id]);

    const checkUserStatus = async () => {
        try {
            const [{ data: profile }, { data: employeeData }] = await Promise.all([
                supabase.from('profiles').select('biometric_enabled').eq('id', user?.id).maybeSingle(),
                supabase.from('employees').select('status').eq('user_id', user?.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
            ]);
            setIsLocked(Boolean(profile?.biometric_enabled));
            setIsPending(employeeData?.status === 'pending');
        } catch (error) {
            console.error('Error checking account status:', error);
        } finally {
            setCheckingLock(false);
        }
    };

    if (authLoading || checkingLock) {
        return <View style={[styles.loading, { backgroundColor: isDark ? brand.colors.navySoft : brand.colors.background }]}><OperixLogo width={180} reversed={isDark} /><ActivityIndicator size="small" color={brand.colors.primary} style={styles.loadingIndicator} /><Text style={[styles.loadingText, { color: isDark ? '#94a3b8' : brand.colors.muted }]}>{t('openingWorkspace', language)}</Text></View>;
    }
    if (user && isPending) return <NavigationContainer theme={isDark ? CustomDarkTheme : CustomLightTheme}><ApprovalPendingScreen /></NavigationContainer>;
    if (user && isLocked) return <NavigationContainer theme={isDark ? CustomDarkTheme : CustomLightTheme}><BiometricOverlay onAuthenticated={() => setIsLocked(false)} /></NavigationContainer>;
    return <NavigationContainer theme={isDark ? CustomDarkTheme : CustomLightTheme}>{user ? <RootNavigator /> : <AuthNavigator />}</NavigationContainer>;
}

const styles = StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingIndicator: { marginTop: 28 },
    loadingText: { marginTop: 10, fontSize: 13, fontFamily: brand.fonts.medium },
    lockContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    lockIconContainer: { width: 116, height: 116, borderRadius: 58, backgroundColor: 'rgba(0,79,254,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
    lockTitle: { fontSize: 24, fontFamily: brand.fonts.semibold, marginBottom: 10 },
    lockText: { fontSize: 15, fontFamily: brand.fonts.regular, textAlign: 'center', lineHeight: 22 },
});
