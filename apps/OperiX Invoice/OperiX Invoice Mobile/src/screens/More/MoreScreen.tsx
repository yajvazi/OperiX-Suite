import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    BarChart3,
    BookOpen,
    Building2,
    ChevronRight,
    CircleHelp,
    FileSignature,
    FileText,
    Globe2,
    Info,
    Landmark,
    LogOut,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Users,
} from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, GlobalCreateButton, LoadingState, MobileHeader, MobileScreen, ShortcutRow, SectionTitle } from '../../components/mobile/MobileUI';

export function MoreScreen() {
    const { user, signOut, deleteAccount } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [permissions, setPermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const [deletingAccount, setDeletingAccount] = useState(false);

    useFocusEffect(useCallback(() => {
        let active = true;
        const loadRole = async () => {
            if (!user) return;
            setError(null);
            try {
                const scope = await getWorkspaceScope(user.id);
                if (active) {
                    setPermissions(scope.permissions);
                    setPlatformAdmin(scope.platformAdmin);
                }
            } catch (error) {
                console.warn('More permissions error:', error);
                if (active) setError(t('workspacePermissionsError', language));
            } finally {
                if (active) setLoading(false);
            }
        };
        void loadRole();
        return () => { active = false; };
    }, [user, retryToken]));

    const can = (permission: string) => platformAdmin || permissions.includes(permission);

    const handleDeleteAccount = async () => {
        setDeletingAccount(true);
        const { error: deletionError } = await deleteAccount();
        setDeletingAccount(false);
        if (deletionError) Alert.alert(t('deleteAccount', language), t('deleteAccountError', language));
    };

    const confirmDeleteAccount = () => Alert.alert(
        t('deleteAccountTitle', language),
        t('deleteAccountConfirmation', language),
        [
            { text: t('cancel', language), style: 'cancel' },
            { text: t('deleteAccountConfirm', language), style: 'destructive', onPress: () => void handleDeleteAccount() },
        ],
    );

    const deleteAccountButton = (
        <TouchableOpacity
            testID="more-delete-account-button"
            accessibilityRole="button"
            disabled={deletingAccount}
            onPress={confirmDeleteAccount}
            style={[styles.deleteAccount, { borderColor: brand.colors.error, opacity: deletingAccount ? 0.55 : 1 }]}
        >
            <Trash2 color={brand.colors.error} size={18} />
            <Text style={[styles.signOutText, { color: brand.colors.error }]}>{t('deleteAccount', language)}</Text>
        </TouchableOpacity>
    );

    return (
        <MobileScreen testID="more-screen">
            <MobileHeader title={t('more', language)} subtitle={t('advancedToolsAndSettings', language)} />
            {loading ? <LoadingState label={t('checkingWorkspaceAccess', language)} /> : error ? <View style={styles.errorRecovery}><ErrorState onRetry={() => { setLoading(true); setError(null); setRetryToken((value) => value + 1); }} message={error} />{deleteAccountButton}<TouchableOpacity testID="more-error-logout-button" accessibilityRole="button" onPress={() => { void signOut(); }} style={[styles.signOut, { borderColor: palette.border }]}><LogOut color={brand.colors.error} size={18} /><Text style={[styles.signOutText, { color: brand.colors.error }]}>{t('signOut', language)}</Text></TouchableOpacity></View> : <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <SectionTitle title={t('operixIntelligence', language)} />
                <ShortcutRow testID="more-operix-ai-button" icon={Sparkles} title={t('operixIntelligence', language)} description={t('operixIntelligenceOpenDescription', language)} onPress={() => navigation.navigate('OperixAI')} trailing={<ChevronRight color={palette.muted} size={18} />} />
                <SectionTitle title={t('finance', language)} />
                {can('accounting_period.view') ? <ShortcutRow testID="more-accounting-button" icon={Landmark} title={t('accounting', language)} description={t('journalPeriodsAccountTools', language)} onPress={() => navigation.navigate('Accounting')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('reports.operational') || can('reports.profit') || can('reports.sales') ? <ShortcutRow testID="more-reports-button" icon={BarChart3} title={t('reports', language)} description={t('statementsLedgersAgingReconciliation', language)} onPress={() => navigation.navigate('ReportsHub')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('reports.tax') || can('sales_book.view') ? <ShortcutRow testID="more-taxes-button" icon={BookOpen} title={t('taxes', language)} description={t('salesBookTaxActivity', language)} onPress={() => navigation.navigate('TaxCenter')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('payment.view') ? <ShortcutRow testID="more-payments-button" icon={Landmark} title={t('money', language)} description={t('customerPaymentsCashMovement', language)} onPress={() => navigation.navigate('PaymentsList')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('payment.view') ? <ShortcutRow testID="more-other-income-button" icon={Landmark} title={t('otherIncome', language)} description={t('otherIncomeDescription', language)} onPress={() => navigation.navigate('OtherIncome')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('settings.bank') || can('payment.view') ? <ShortcutRow testID="more-cash-bank-button" icon={Landmark} title={t('cashAndBank', language)} description={t('cashAndBankDescription', language)} onPress={() => navigation.navigate('FinancialAccounts')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('expense.view_all') ? <ShortcutRow testID="more-purchases-button" icon={FileText} title={t('purchases', language)} description={t('suppliersBillsPayments', language)} onPress={() => navigation.navigate('SupplierBillsList')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('inventory.view') ? <ShortcutRow testID="more-inventory-button" icon={Building2} title={t('inventory', language)} description={t('productsStockOperations', language)} onPress={() => navigation.navigate('ProductsList')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('users.view') ? <ShortcutRow testID="more-payroll-button" icon={Users} title={t('payroll', language)} description={t('payrollStatus', language)} onPress={() => navigation.navigate('Payroll')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}

                <SectionTitle title={t('documents', language)} />
                {can('contracts.manage') ? <ShortcutRow testID="more-contracts-button" icon={FileSignature} title={t('contracts', language)} description={t('contractsAndAgreements', language)} onPress={() => navigation.navigate('MainTabs', { screen: 'Sales', params: { mode: 'contracts' } })} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('contracts.manage') ? <ShortcutRow testID="more-templates-button" icon={FileText} title={t('templates', language)} description={t('invoiceAndContractTemplates', language)} onPress={() => navigation.navigate('ContractTemplates')} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}

                <SectionTitle title={t('administration', language)} />
                {can('users.manage') ? <ShortcutRow testID="more-users-access-button" icon={Users} title="Users & Access" description="Manage company users, permissions, invitations, and paid seats" onPress={() => navigation.navigate('Settings', { screen: 'UsersAccess' })} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('settings.company') || can('users.manage') ? <ShortcutRow testID="more-company-button" icon={Building2} title={t('company', language)} description={t('switchOrManageCompanies', language)} onPress={() => navigation.navigate('Settings', { screen: 'ManageCompanies' })} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('settings.integrations') ? <ShortcutRow testID="more-integrations-button" icon={Globe2} title={t('integrations', language)} description={t('paymentsConnectedServices', language)} onPress={() => navigation.navigate('Settings', { screen: 'PaymentIntegrations' })} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                {can('settings.company') || can('settings.invoice') || can('settings.bank') || can('settings.security') ? <ShortcutRow testID="more-settings-button" icon={SlidersHorizontal} title={t('settings', language)} description={t('preferencesProfileSecurity', language)} onPress={() => navigation.navigate('Settings', { screen: 'SettingsMain' })} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}

                <SectionTitle title={t('support', language)} />
                <ShortcutRow testID="more-help-button" icon={CircleHelp} title={t('helpSupport', language)} description={t('supportResourcesUnavailable', language)} onPress={() => navigation.navigate('HelpSupport')} trailing={<ChevronRight color={palette.muted} size={18} />} />
                <ShortcutRow testID="more-about-button" icon={Info} title={t('aboutOperixInvoice', language)} description={t('appVersionLegalInfo', language)} onPress={() => navigation.navigate('About')} trailing={<ChevronRight color={palette.muted} size={18} />} />

                {deleteAccountButton}
                <TouchableOpacity testID="more-logout-button" accessibilityRole="button" onPress={() => Alert.alert(t('signOut', language), t('signOutWorkspace', language), [{ text: t('cancel', language), style: 'cancel' }, { text: t('signOut', language), style: 'destructive', onPress: () => void signOut() }])} style={[styles.signOut, { borderColor: palette.border }]}><LogOut color={brand.colors.error} size={18} /><Text style={[styles.signOutText, { color: brand.colors.error }]}>{t('signOut', language)}</Text></TouchableOpacity>
                <View style={{ height: 90 }} />
            </ScrollView>}
            <GlobalCreateButton />
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 18 },
    errorRecovery: { paddingHorizontal: 20 },
    deleteAccount: { minHeight: 50, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 14 },
    signOut: { minHeight: 50, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 14 },
    signOutText: { fontSize: 13, fontFamily: brand.fonts.semibold },
});
