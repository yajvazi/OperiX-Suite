import React, { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Activity, ArrowDownUp, CreditCard, Landmark, WalletCards } from 'lucide-react-native';
import { createFundTransfer, listCompanyAgents, listFundBalances, supabase } from '@invoice-monorepo/api';
import type { CompanyAgent, FundBalance } from '@invoice-monorepo/types';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { Button, Input } from '@invoice-monorepo/ui';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { notifyBusinessEvent } from '../../services/pushNotifications';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

const today = () => new Date().toISOString().slice(0, 10);

function agentDisplayName(agent: CompanyAgent) {
    const name = [agent.first_name, agent.last_name].filter(Boolean).join(' ').trim();
    return name || agent.email || agent.user_id;
}

function fundRowKey(fund?: FundBalance | null) {
    return fund ? `${fund.company_id}:${fund.id}` : '';
}

type AgentSale = {
    user_id: string;
    total_amount: number | string | null;
    accounting_state?: string | null;
    type?: string | null;
    status?: string | null;
    commercial_document_type?: string | null;
    commercial_status?: string | null;
};

export function CashBalancesScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [funds, setFunds] = useState<FundBalance[]>([]);
    const [tenantNames, setTenantNames] = useState<Map<string, string>>(new Map());
    const [agents, setAgents] = useState<CompanyAgent[]>([]);
    const [sales, setSales] = useState<AgentSale[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState('all');
    const [showAgentPicker, setShowAgentPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const [modal, setModal] = useState<'transfer' | null>(null);
    const [selectionMode, setSelectionMode] = useState<'source' | 'target'>('source');
    const [sourceId, setSourceId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(today());
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const loadFunds = useCallback(async () => {
        if (!user) return;
            setLoading(true);
            setError(null);
        try {
            const scope = await getWorkspaceScope(user.id);
            const [rows, salesResult] = await Promise.all([
                listFundBalances(supabase, scope.companyIds),
                supabase
                    .from('invoices')
                    .select('user_id,total_amount,accounting_state,type,status,commercial_document_type,commercial_status')
                    .in('company_id', scope.companyIds)
                    .eq('accounting_state', 'posted'),
            ]);
            if (salesResult.error) console.warn('Agent sales lookup unavailable:', salesResult.error);
            let agentRows: CompanyAgent[] = [];
            try {
                const agentGroups = await Promise.all(scope.companyIds.map((companyId) => listCompanyAgents(supabase, companyId)));
                agentRows = Array.from(new Map(
                    agentGroups.flat().filter((agent) => Boolean(agent.user_id)).map((agent) => [agent.user_id, agent]),
                ).values());
            } catch (agentError) {
                console.warn('Company agent lookup unavailable:', agentError);
            }
            setFunds(rows);
            setTenantNames(new Map(scope.companies.map((company) => [company.id, company.company_name || company.name || company.id])));
            setAgents(agentRows);
            setSales((salesResult.data || []) as AgentSale[]);
            setSelectedAgentId((current) => current === 'all' || agentRows.some((agent) => agent.user_id === current) ? current : 'all');
            setSourceId((current) => rows.some((fund) => fundRowKey(fund) === current) ? current : fundRowKey(rows[0]) || '');
            setTargetId((current) => rows.some((fund) => fundRowKey(fund) === current) ? current : fundRowKey(rows[1]) || '');
        } catch (loadError) {
            console.error('Fund balances load error:', loadError);
            setError(t('fundBalancesLoadError', language));
        } finally {
            setLoading(false);
        }
    }, [language, retryToken, user]);

    useFocusEffect(useCallback(() => {
        void loadFunds();
    }, [loadFunds]));

    const total = useMemo(() => Array.from(new Map(funds.map((fund) => [fund.id, fund])).values())
        .reduce((sum, fund) => sum + Number(fund.provider_available_balance ?? fund.balance ?? 0), 0), [funds]);
    const selectedAgent = agents.find((agent) => agent.user_id === selectedAgentId);
    const agentSales = useMemo(() => sales.filter((sale) => {
        const type = String(sale.commercial_document_type || sale.type || '').toUpperCase();
        const status = String(sale.commercial_status || sale.status || '').toUpperCase();
        return ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE'].includes(type)
            && !['CANCELLED', 'CREDITED', 'REVERSED'].includes(status)
            && (selectedAgentId === 'all' || String(sale.user_id) === selectedAgentId);
    }), [sales, selectedAgentId]);
    const agentSalesTotal = useMemo(() => agentSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0), [agentSales]);
    const selectedSource = funds.find((fund) => fundRowKey(fund) === sourceId);
    const selectedTarget = funds.find((fund) => fundRowKey(fund) === targetId);

    const closeModal = () => {
        if (saving) return;
        setModal(null);
        setAmount('');
        setDate(today());
        setDescription('');
        setSelectionMode('source');
    };

    const saveTransfer = async () => {
        const value = Number(amount.replace(',', '.'));
        if (!selectedSource || !selectedTarget || selectedSource.id === selectedTarget.id) {
            Alert.alert(t('error', language), t('selectDifferentFunds', language));
            return;
        }
        if (selectedSource.owner_company_id && selectedTarget.owner_company_id && selectedSource.owner_company_id !== selectedTarget.owner_company_id) {
            Alert.alert(t('error', language), t('internalTransferSameTenant', language));
            return;
        }
        if (!Number.isFinite(value) || value <= 0) {
            Alert.alert(t('error', language), t('transferAmountRequired', language));
            return;
        }
        if (value > Number(selectedSource.balance)) {
            Alert.alert(t('error', language), t('insufficientFunds', language));
            return;
        }
        setSaving(true);
        try {
            const transfer = await createFundTransfer(supabase, {
                sourceFundAccountId: selectedSource.id,
                targetFundAccountId: selectedTarget.id,
                amount: value,
                transferDate: date,
                description,
            });
            void notifyBusinessEvent('money_transferred', String((transfer as any).company_id || ''), String((transfer as any).id), {
                amount: value,
                currency: (transfer as any).currency || 'EUR',
            }).catch((notificationError) => console.warn('Transfer notification could not be sent:', notificationError));
            closeModal();
            await loadFunds();
        } catch (saveError) {
            console.error('Fund transfer error:', saveError);
            Alert.alert(t('error', language), t('fundTransferSaveError', language));
        } finally {
            setSaving(false);
        }
    };

    const openTransfer = () => {
        if (!sourceId && funds[0]) setSourceId(funds[0].id);
        if (!targetId && funds[1]) setTargetId(funds[1].id);
        setModal('transfer');
    };

    return (
        <MobileScreen testID="cash-balances-screen">
            <MobileHeader title={t('cashBalances', language)} subtitle={t('cashBalancesDescription', language)} onBack={() => navigation.goBack()} />
            {loading ? <LoadingState label={t('loadingCashBalances', language)} /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRetryToken((value) => value + 1); }} /> : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                    {agents.length ? <View style={[styles.agentPanel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <Text style={[styles.agentLabel, { color: palette.muted }]}>{t('agent', language)}</Text>
                        <TouchableOpacity
                            testID="cash-balances-agent-selector"
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showAgentPicker }}
                            onPress={() => setShowAgentPicker((current) => !current)}
                            style={[styles.agentSelector, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}
                        >
                            <Text style={[styles.agentSelectorText, { color: palette.text }]}>{selectedAgentId === 'all' ? t('allAgents', language) : selectedAgent ? agentDisplayName(selectedAgent) : t('selectAgent', language)}</Text>
                        </TouchableOpacity>
                        {showAgentPicker ? <View style={[styles.agentOptions, { borderColor: palette.border, backgroundColor: palette.surface }]}>
                            <TouchableOpacity testID="cash-balances-agent-all" onPress={() => { setSelectedAgentId('all'); setShowAgentPicker(false); }} style={[styles.agentOption, selectedAgentId === 'all' && { backgroundColor: palette.iconSurface }]}>
                                <Text style={{ color: palette.text }}>{t('allAgents', language)}</Text>
                            </TouchableOpacity>
                            {agents.map((agent) => <TouchableOpacity key={agent.user_id} testID={`cash-balances-agent-${agent.user_id}`} onPress={() => { setSelectedAgentId(agent.user_id); setShowAgentPicker(false); }} style={[styles.agentOption, selectedAgentId === agent.user_id && { backgroundColor: palette.iconSurface }]}>
                                <Text style={{ color: palette.text }}>{agentDisplayName(agent)}</Text>
                                {agent.email ? <Text style={[styles.agentOptionEmail, { color: palette.muted }]}>{agent.email}</Text> : null}
                            </TouchableOpacity>)}
                        </View> : null}
                    </View> : null}

                    <View style={[styles.salesCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.salesCardHeader}>
                            <View style={styles.salesCardCopy}>
                                <Text style={[styles.salesTitle, { color: palette.text }]}>{t('agentSales', language)}</Text>
                                <Text style={[styles.salesDescription, { color: palette.muted }]}>{t('agentSalesDescription', language)}</Text>
                            </View>
                            <Text style={[styles.salesAmount, { color: brand.colors.success }]}>{formatCurrency(agentSalesTotal, 'EUR', language)}</Text>
                        </View>
                        <View style={[styles.salesMeta, { borderTopColor: palette.border }]}> 
                            <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('documentsSold', language)}: {agentSales.length}</Text>
                            {selectedAgentId !== 'all' && selectedAgent ? <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{agentDisplayName(selectedAgent)}</Text> : null}
                        </View>
                        {selectedAgentId !== 'all' && selectedAgent ? <Button
                            title={t('viewAgentActivity', language)}
                            icon={Activity}
                            size="small"
                            onPress={() => navigation.navigate('AgentActivity', { agentId: selectedAgent.user_id, agentName: agentDisplayName(selectedAgent) })}
                            style={styles.activityButton}
                        /> : null}
                    </View>

                    <View style={[styles.totalCard, { backgroundColor: brand.colors.primary }]}> 
                        <Text style={styles.totalLabel}>{t('totalAvailableFunds', language)}</Text>
                        <Text style={styles.totalValue}>{formatCurrency(total, funds[0]?.currency || 'EUR', language)}</Text>
                        <Text style={styles.totalHint}>{t('cashBalancesHint', language)}</Text>
                    </View>

                    <View style={styles.actionsRow}>
                        <Button title={t('moveMoney', language)} icon={ArrowDownUp} size="small" onPress={openTransfer} disabled={funds.length < 2} style={styles.actionButton} />
                    </View>

                    {funds.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>{t('noFundAccounts', language)}</Text> : funds.map((fund) => {
                        const Icon = fund.stripe_store_id ? CreditCard : fund.fund_type === 'cash' ? WalletCards : Landmark;
                        const displayedBalance = fund.stripe_store_id && fund.provider_available_balance !== null && fund.provider_available_balance !== undefined
                            ? Number(fund.provider_available_balance)
                            : Number(fund.balance);
                        const tenantName = tenantNames.get(fund.company_id) || fund.company_id;
                        const rowKey = fundRowKey(fund);
                        return (
                            <View key={rowKey} style={[styles.fundCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                                <View style={[styles.fundIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={22} /></View>
                                <View style={styles.fundCopy}>
                                    <Text style={[styles.fundName, { color: palette.text }]}>{fund.name}</Text>
                                    <Text style={[styles.fundTenant, { color: palette.text }]}>{tenantName}</Text>
                                    <Text style={[styles.fundType, { color: palette.muted }]}>{fund.stripe_store_id ? 'Stripe balance' : fund.fund_type === 'cash' ? t('cashAccount', language) : t('bankAccount', language)}{fund.is_shared ? ` · ${t('sharedAccount', language)}` : ''}</Text>
                                </View>
                                <View style={styles.fundAmount}>
                                    <Text style={[styles.balance, { color: displayedBalance < 0 ? palette.error : palette.text }]}>{formatCurrency(displayedBalance, fund.currency, language)}</Text>
                                    {fund.stripe_store_id && fund.provider_pending_balance !== null && fund.provider_pending_balance !== undefined ? <Text style={[styles.editBalance, { color: palette.muted }]}>{`Pending ${formatCurrency(Number(fund.provider_pending_balance), fund.currency, language)}`}</Text> : null}
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            <Modal visible={modal !== null} animationType="slide" transparent onRequestClose={closeModal}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={[styles.modalCard, { backgroundColor: palette.surface }]}>
                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
                            <Text style={[styles.modalTitle, { color: palette.text }]}>{t('moveMoneyTitle', language)}</Text>
                            <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('fromAccount', language)}</Text>
                            <TouchableOpacity style={[styles.selector, { borderColor: palette.border }]} onPress={() => setSelectionMode('source')}><Text style={{ color: palette.text }}>{selectedSource ? `${selectedSource.name} · ${tenantNames.get(selectedSource.company_id) || selectedSource.company_id}` : t('selectSourceAccount', language)}</Text></TouchableOpacity>
                            <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('toAccount', language)}</Text>
                            <TouchableOpacity style={[styles.selector, { borderColor: palette.border }]} onPress={() => setSelectionMode('target')}><Text style={{ color: palette.text }}>{selectedTarget ? `${selectedTarget.name} · ${tenantNames.get(selectedTarget.company_id) || selectedTarget.company_id}` : t('selectTargetAccount', language)}</Text></TouchableOpacity>
                            <Text style={[styles.selectionHint, { color: palette.muted }]}>{selectionMode === 'source' ? t('selectSourceAccount', language) : t('selectTargetAccount', language)}</Text>
                            <View style={styles.selectionList}>{funds.map((fund) => { const rowKey = fundRowKey(fund); return <TouchableOpacity key={rowKey} onPress={() => { if (selectionMode === 'source') setSourceId(rowKey); else setTargetId(rowKey); }} style={[styles.selectionItem, { backgroundColor: (selectionMode === 'source' ? sourceId : targetId) === rowKey ? palette.iconSurface : palette.surfaceMuted }]}><Text style={{ color: palette.text }}>{fund.name} · {tenantNames.get(fund.company_id) || fund.company_id} · {formatCurrency(Number(fund.balance), fund.currency, language)}</Text></TouchableOpacity>; })}</View>
                            <Input label={t('transferAmount', language)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                            <Input label={t('transferDate', language)} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
                            <Input label={t('transferDescription', language)} value={description} onChangeText={setDescription} placeholder={t('optional', language)} />
                            <Button title={t('transfer', language)} onPress={() => void saveTransfer()} loading={saving} />
                            <Button title={t('cancel', language)} variant="ghost" onPress={closeModal} disabled={saving} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingBottom: 30 },
    agentPanel: { borderRadius: 17, borderWidth: 1, padding: 14, marginBottom: 12, ...brand.shadow.card },
    agentLabel: { fontSize: 11, fontFamily: brand.fonts.medium, marginBottom: 6 },
    agentSelector: { minHeight: 46, borderRadius: 12, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 12 },
    agentSelectorText: { fontSize: 14, fontFamily: brand.fonts.medium },
    agentOptions: { borderRadius: 12, borderWidth: 1, marginTop: 7, overflow: 'hidden' },
    agentOption: { paddingHorizontal: 12, paddingVertical: 11 },
    agentOptionEmail: { fontSize: 11, marginTop: 3 },
    salesCard: { borderRadius: 17, borderWidth: 1, padding: 16, marginBottom: 14, ...brand.shadow.card },
    salesCardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    salesCardCopy: { flex: 1, paddingRight: 12 },
    salesTitle: { fontSize: 15, fontFamily: brand.fonts.semibold },
    salesDescription: { fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily: brand.fonts.regular },
    salesAmount: { fontSize: 19, fontFamily: brand.fonts.semibold },
    salesMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 13, paddingTop: 10 },
    salesMetaLabel: { fontSize: 11, fontFamily: brand.fonts.medium },
    activityButton: { marginTop: 12 },
    totalCard: { borderRadius: 20, padding: 20, marginBottom: 14 },
    totalLabel: { color: '#dbeafe', fontSize: 13, fontFamily: brand.fonts.medium },
    totalValue: { color: '#fff', fontSize: 30, fontFamily: brand.fonts.semibold, marginTop: 6 },
    totalHint: { color: '#bfdbfe', fontSize: 12, fontFamily: brand.fonts.regular, marginTop: 6 },
    actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    actionButton: { flex: 1 },
    fundCard: { minHeight: 84, borderRadius: 17, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, ...brand.shadow.card },
    fundIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    fundCopy: { flex: 1 },
    fundName: { fontSize: 15, fontFamily: brand.fonts.semibold },
    fundTenant: { fontSize: 12, fontFamily: brand.fonts.medium, marginTop: 2 },
    fundType: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 4 },
    fundAmount: { alignItems: 'flex-end' },
    balance: { fontSize: 15, fontFamily: brand.fonts.semibold },
    editBalance: { fontSize: 10, fontFamily: brand.fonts.semibold, marginTop: 5 },
    empty: { textAlign: 'center', padding: 30, fontFamily: brand.fonts.regular },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
    modalCard: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    modalContent: { padding: 22, paddingBottom: 32 },
    modalTitle: { fontSize: 20, fontFamily: brand.fonts.semibold, marginBottom: 18 },
    fieldLabel: { fontSize: 12, fontFamily: brand.fonts.medium, marginBottom: 6, marginTop: 10 },
    selector: { borderWidth: 1, borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 14 },
    selectionHint: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 12 },
    selectionList: { gap: 7, marginTop: 7, marginBottom: 6 },
    selectionItem: { minHeight: 40, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 },
});
