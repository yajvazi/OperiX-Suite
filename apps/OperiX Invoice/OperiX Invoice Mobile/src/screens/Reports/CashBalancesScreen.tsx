import React, { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import { Activity, ArrowDownUp, CreditCard, HandCoins, Landmark, WalletCards } from 'lucide-react-native';
import { createAgentAdvance, createAgentSettlement, createFundTransfer, createPostCodSettlement, createStripePayoutSettlement, listCompanyAgents, listFundBalances, supabase } from '@invoice-monorepo/api';
import type { AgentAdvance, AgentSettlement, CompanyAgent, FundBalance, PostCodSettlement, StripePayoutSettlement } from '@invoice-monorepo/types';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { Button, Input } from '@invoice-monorepo/ui';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { notifyBusinessEvent } from '../../services/pushNotifications';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

const today = () => new Date().toISOString().slice(0, 10);

async function generateSettlementIdempotencyKey(): Promise<string> {
    const nativeUuid = Crypto.randomUUID?.();
    if (nativeUuid) return nativeUuid;

    const bytes = await Crypto.getRandomBytesAsync(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function agentDisplayName(agent: CompanyAgent) {
    const name = [agent.first_name, agent.last_name].filter(Boolean).join(' ').trim();
    return name || agent.email || agent.user_id;
}

function fundRowKey(fund?: FundBalance | null) {
    return fund ? `${fund.company_id}:${fund.id}` : '';
}

function isMissingAgentSettlementsTable(error: { code?: string | null; message?: string | null } | null) {
    return Boolean(error && (
        error.code === 'PGRST205'
        || error.message?.includes('agent_settlements')
    ));
}

function isMissingPostCodSettlementsTable(error: { code?: string | null; message?: string | null } | null) {
    return Boolean(error && (
        error.code === 'PGRST205'
        || error.message?.includes('post_cod_settlements')
    ));
}

function isMissingStripePayoutSettlementsTable(error: { code?: string | null; message?: string | null } | null) {
    return Boolean(error && (
        error.code === 'PGRST205'
        || error.message?.includes('stripe_payout_settlements')
    ));
}

type AgentSale = {
    user_id: string;
    company_id: string;
    total_amount: number | string | null;
    payment_method?: string | null;
    stripe_store_id?: string | null;
    accounting_state?: string | null;
    type?: string | null;
    status?: string | null;
    post_cod?: boolean | null;
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
    const [settlements, setSettlements] = useState<AgentSettlement[]>([]);
    const [advances, setAdvances] = useState<AgentAdvance[]>([]);
    const [postCodSettlements, setPostCodSettlements] = useState<PostCodSettlement[]>([]);
    const [stripePayoutSettlements, setStripePayoutSettlements] = useState<StripePayoutSettlement[]>([]);
    const [settlementsAvailable, setSettlementsAvailable] = useState(true);
    const [postCodSettlementsAvailable, setPostCodSettlementsAvailable] = useState(true);
    const [stripePayoutSettlementsAvailable, setStripePayoutSettlementsAvailable] = useState(true);
    const [selectedAgentId, setSelectedAgentId] = useState('all');
    const [showAgentPicker, setShowAgentPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const [modal, setModal] = useState<'transfer' | 'settlement' | 'advance' | 'stripe_payout' | null>(null);
    const [settlementTarget, setSettlementTarget] = useState<'agent' | 'post_cod'>('agent');
    const [selectionMode, setSelectionMode] = useState<'source' | 'target'>('source');
    const [sourceId, setSourceId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(today());
    const [description, setDescription] = useState('');
    const [settlementFundKey, setSettlementFundKey] = useState('');
    const [stripePayoutFundKey, setStripePayoutFundKey] = useState('');
    const [stripePayoutBankKey, setStripePayoutBankKey] = useState('');
    const [bankFee, setBankFee] = useState('');
    const [saving, setSaving] = useState(false);

    const loadFunds = useCallback(async () => {
        if (!user) return;
            setLoading(true);
            setError(null);
        try {
            const scope = await getWorkspaceScope(user.id);
            const [rows, salesResult, settlementResult, advanceResult, postCodSettlementResult, stripePayoutSettlementResult] = await Promise.all([
                listFundBalances(supabase, scope.companyIds),
                supabase
                    .from('invoices')
                    .select('user_id,total_amount,company_id,accounting_state,type,status,post_cod,payment_method,stripe_store_id')
                    .in('company_id', scope.companyIds)
                    .eq('accounting_state', 'posted'),
                supabase
                    .from('agent_settlements')
                    .select('id,company_id,agent_user_id,fund_account_id,amount,currency,settlement_date,description,idempotency_key,status,created_at,created_by')
                    .in('company_id', scope.companyIds)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('agent_advances')
                    .select('id,company_id,agent_user_id,fund_account_id,amount,currency,advance_date,description,idempotency_key,status,created_at,created_by')
                    .in('company_id', scope.companyIds)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('post_cod_settlements')
                    .select('id,company_id,fund_account_id,amount,currency,settlement_date,description,idempotency_key,status,created_at,created_by')
                    .in('company_id', scope.companyIds)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('stripe_payout_settlements')
                    .select('id,company_id,stripe_fund_account_id,bank_fund_account_id,payout_amount,bank_fee,net_received,currency,settlement_date,description,idempotency_key,status,created_at,created_by')
                    .in('company_id', scope.companyIds)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false }),
            ]);
            if (salesResult.error) console.warn('Agent sales lookup unavailable:', salesResult.error);
            const missingSettlementsTable = isMissingAgentSettlementsTable(settlementResult.error);
            if (settlementResult.error && !missingSettlementsTable) throw settlementResult.error;
            if (missingSettlementsTable) console.warn('Agent settlements migration is not available in this environment yet:', settlementResult.error);
            if (advanceResult.error) throw advanceResult.error;
            const missingPostCodSettlementsTable = isMissingPostCodSettlementsTable(postCodSettlementResult.error);
            if (postCodSettlementResult.error && !missingPostCodSettlementsTable) throw postCodSettlementResult.error;
            if (missingPostCodSettlementsTable) console.warn('Post COD settlements migration is not available in this environment yet:', postCodSettlementResult.error);
            const missingStripePayoutSettlementsTable = isMissingStripePayoutSettlementsTable(stripePayoutSettlementResult.error);
            if (stripePayoutSettlementResult.error && !missingStripePayoutSettlementsTable) throw stripePayoutSettlementResult.error;
            if (missingStripePayoutSettlementsTable) console.warn('Stripe payout settlements migration is not available in this environment yet:', stripePayoutSettlementResult.error);
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
            setSettlements((settlementResult.data || []) as AgentSettlement[]);
            setAdvances((advanceResult.data || []) as AgentAdvance[]);
            setPostCodSettlements((postCodSettlementResult.data || []) as PostCodSettlement[]);
            setStripePayoutSettlements((stripePayoutSettlementResult.data || []) as StripePayoutSettlement[]);
            setSettlementsAvailable(!missingSettlementsTable);
            setPostCodSettlementsAvailable(!missingPostCodSettlementsTable);
            setStripePayoutSettlementsAvailable(!missingStripePayoutSettlementsTable);
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
        .reduce((sum, fund) => sum + Number(fund.provider_available_balance ?? fund.available_balance ?? fund.balance ?? 0), 0), [funds]);
    const selectedAgent = agents.find((agent) => agent.user_id === selectedAgentId);
    const agentSales = useMemo(() => sales.filter((sale) => {
        const type = String(sale.type || '').toUpperCase();
        const status = String(sale.status || '').toUpperCase();
        return ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE'].includes(type)
            && !['CANCELLED', 'CREDITED', 'REVERSED'].includes(status)
            && !sale.post_cod
            && String(sale.payment_method || '').toLowerCase() === 'cash'
            && (selectedAgentId === 'all' || String(sale.user_id) === selectedAgentId);
    }), [sales, selectedAgentId]);
    const postCodSales = useMemo(() => sales.filter((sale) => {
        const type = String(sale.type || '').toUpperCase();
        const status = String(sale.status || '').toUpperCase();
        return Boolean(sale.post_cod)
            && ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE'].includes(type)
            && !['CANCELLED', 'CREDITED', 'REVERSED'].includes(status);
    }), [sales]);
    const agentSalesGrossTotal = useMemo(() => agentSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0), [agentSales]);
    const agentSettledTotal = useMemo(() => settlements
        .filter((settlement) => selectedAgentId === 'all' || settlement.agent_user_id === selectedAgentId)
        .reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0), [selectedAgentId, settlements]);
    const agentAdvancedTotal = useMemo(() => advances
        .filter((advance) => selectedAgentId === 'all' || advance.agent_user_id === selectedAgentId)
        .reduce((sum, advance) => sum + Number(advance.amount || 0), 0), [advances, selectedAgentId]);
    const agentSalesTotal = Math.max(agentSalesGrossTotal + agentAdvancedTotal - agentSettledTotal, 0);
    const postCodGrossTotal = useMemo(() => postCodSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0), [postCodSales]);
    const postCodSettledTotal = useMemo(() => postCodSettlements.reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0), [postCodSettlements]);
    const postCodTotal = Math.max(postCodGrossTotal - postCodSettledTotal, 0);
    const settlementFunds = useMemo(() => funds.filter((fund) => !fund.stripe_store_id && (fund.fund_type === 'cash' || fund.fund_type === 'bank')), [funds]);
    const stripeFunds = useMemo(() => funds.filter((fund) => Boolean(fund.stripe_store_id)), [funds]);
    const stripePayoutNetReceivedTotal = useMemo(() => stripePayoutSettlements.reduce((sum, settlement) => sum + Number(settlement.net_received || 0), 0), [stripePayoutSettlements]);
    const agentOutstandingForCompany = (companyId: string) => {
        if (!selectedAgent) return 0;
        const companySales = agentSales
            .filter((sale) => sale.company_id === companyId && sale.user_id === selectedAgent.user_id)
            .reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        const companySettlements = settlements
            .filter((settlement) => settlement.company_id === companyId && settlement.agent_user_id === selectedAgent.user_id)
            .reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0);
        const companyAdvances = advances
            .filter((advance) => advance.company_id === companyId && advance.agent_user_id === selectedAgent.user_id)
            .reduce((sum, advance) => sum + Number(advance.amount || 0), 0);
        return Math.max(companySales + companyAdvances - companySettlements, 0);
    };
    const postCodOutstandingForCompany = (companyId: string) => {
        const companySales = postCodSales
            .filter((sale) => sale.company_id === companyId)
            .reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        const companySettlements = postCodSettlements
            .filter((settlement) => settlement.company_id === companyId)
            .reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0);
        return Math.max(companySales - companySettlements, 0);
    };
    const selectedSource = funds.find((fund) => fundRowKey(fund) === sourceId);
    const selectedTarget = funds.find((fund) => fundRowKey(fund) === targetId);
    const selectedSettlementFund = settlementFunds.find((fund) => fundRowKey(fund) === settlementFundKey);
    const selectedStripePayoutFund = stripeFunds.find((fund) => fundRowKey(fund) === stripePayoutFundKey);
    const selectedStripePayoutBank = settlementFunds.find((fund) => fundRowKey(fund) === stripePayoutBankKey);
    const payoutPreview = Number(amount.replace(',', '.'));
    const feePreview = Number((bankFee || '0').replace(',', '.'));
    const netReceivedPreview = Number.isFinite(payoutPreview) && Number.isFinite(feePreview) ? payoutPreview - feePreview : 0;

    const closeModal = () => {
        if (saving) return;
        setModal(null);
        setAmount('');
        setDate(today());
        setDescription('');
        setSettlementFundKey('');
        setStripePayoutFundKey('');
        setStripePayoutBankKey('');
        setBankFee('');
        setSettlementTarget('agent');
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
        if (value > Number(selectedSource.available_balance ?? selectedSource.balance)) {
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

    const openSettlement = () => {
        if (!selectedAgent || agentSalesTotal <= 0) return;
        if (!settlementFunds.length) {
            Alert.alert(t('error', language), t('noFundAccounts', language));
            return;
        }
        const defaultFund = settlementFunds.find((fund) => fundRowKey(fund) === settlementFundKey) || settlementFunds[0];
        setSettlementTarget('agent');
        setSettlementFundKey(fundRowKey(defaultFund));
        setAmount(agentOutstandingForCompany(defaultFund.company_id).toFixed(2));
        setDate(today());
        setDescription('');
        setModal('settlement');
    };

    const openAdvance = () => {
        if (!selectedAgent || !settlementFunds.length) {
            Alert.alert(t('error', language), t('noFundAccounts', language));
            return;
        }
        const defaultFund = settlementFunds.find((fund) => fund.fund_type === 'cash') || settlementFunds[0];
        setSettlementFundKey(fundRowKey(defaultFund));
        setAmount('');
        setDate(today());
        setDescription('');
        setModal('advance');
    };


    const saveAdvance = async () => {
        const value = Number(amount.replace(',', '.'));
        if (!selectedAgent || !selectedSettlementFund) {
            Alert.alert(t('error', language), t('selectSettlementFund', language));
            return;
        }
        if (!Number.isFinite(value) || value <= 0) {
            Alert.alert(t('error', language), t('transferAmountRequired', language));
            return;
        }
        if (value > Number(selectedSettlementFund.available_balance ?? selectedSettlementFund.balance) + 0.0001) {
            Alert.alert(t('error', language), t('insufficientFunds', language));
            return;
        }
        setSaving(true);
        try {
            await createAgentAdvance(supabase, {
                companyId: selectedSettlementFund.company_id,
                agentUserId: selectedAgent.user_id,
                fundAccountId: selectedSettlementFund.id,
                amount: value,
                advanceDate: date,
                description,
                idempotencyKey: await generateSettlementIdempotencyKey(),
            });
            closeModal();
            await loadFunds();
            Alert.alert(t('success', language), t('agentAdvanceSaved', language));
        } catch (saveError) {
            console.error('Agent advance error:', saveError);
            Alert.alert(t('error', language), t('agentAdvanceSaveError', language));
        } finally {
            setSaving(false);
        }
    };

    const openPostCodSettlement = () => {
        if (postCodTotal <= 0) return;
        if (!settlementFunds.length) {
            Alert.alert(t('error', language), t('noFundAccounts', language));
            return;
        }
        const defaultFund = settlementFunds.find((fund) => fundRowKey(fund) === settlementFundKey) || settlementFunds[0];
        setSettlementTarget('post_cod');
        setSettlementFundKey(fundRowKey(defaultFund));
        setAmount(postCodOutstandingForCompany(defaultFund.company_id).toFixed(2));
        setDate(today());
        setDescription('');
        setModal('settlement');
    };

    const openStripePayoutSettlement = () => {
        if (!stripeFunds.length || !settlementFunds.length) {
            Alert.alert(t('error', language), t('noFundAccounts', language));
            return;
        }
        const defaultStripeFund = stripeFunds.find((fund) => fundRowKey(fund) === stripePayoutFundKey) || stripeFunds[0];
        const defaultBankFund = settlementFunds.find((fund) => fund.company_id === defaultStripeFund.company_id)
            || settlementFunds.find((fund) => fundRowKey(fund) === stripePayoutBankKey)
            || settlementFunds[0];
        setStripePayoutFundKey(fundRowKey(defaultStripeFund));
        setStripePayoutBankKey(fundRowKey(defaultBankFund));
        setAmount('');
        setBankFee('');
        setDate(today());
        setDescription('');
        setModal('stripe_payout');
    };

    const saveSettlement = async () => {
        const value = Number(amount.replace(',', '.'));
        if ((!selectedAgent && settlementTarget === 'agent') || !selectedSettlementFund) {
            Alert.alert(t('error', language), t('selectSettlementFund', language));
            return;
        }
        if (!Number.isFinite(value) || value <= 0) {
            Alert.alert(t('error', language), t('transferAmountRequired', language));
            return;
        }
        const availableForTenant = settlementTarget === 'post_cod'
            ? postCodOutstandingForCompany(selectedSettlementFund.company_id)
            : agentOutstandingForCompany(selectedSettlementFund.company_id);
        if (value > availableForTenant + 0.0001) {
            Alert.alert(t('error', language), t(settlementTarget === 'post_cod' ? 'postCodSettlementExceedsBalance' : 'settlementAmountExceedsBalance', language));
            return;
        }
        setSaving(true);
        try {
            const idempotencyKey = await generateSettlementIdempotencyKey();
            if (settlementTarget === 'post_cod') {
                await createPostCodSettlement(supabase, {
                    companyId: selectedSettlementFund.company_id,
                    fundAccountId: selectedSettlementFund.id,
                    amount: value,
                    settlementDate: date,
                    description,
                    idempotencyKey,
                });
            } else {
                await createAgentSettlement(supabase, {
                    companyId: selectedSettlementFund.company_id,
                    agentUserId: selectedAgent!.user_id,
                    fundAccountId: selectedSettlementFund.id,
                    amount: value,
                    settlementDate: date,
                    description,
                    idempotencyKey,
                });
            }
            setModal(null);
            setAmount('');
            setDate(today());
            setDescription('');
            setSettlementFundKey('');
            await loadFunds();
            Alert.alert(t('success', language), t(settlementTarget === 'post_cod' ? 'postCodSettlementSaved' : 'agentSettlementSaved', language));
        } catch (saveError) {
            console.error('Settlement error:', saveError);
            Alert.alert(t('error', language), t(settlementTarget === 'post_cod' ? 'postCodSettlementSaveError' : 'agentSettlementSaveError', language));
        } finally {
            setSaving(false);
        }
    };

    const saveStripePayoutSettlement = async () => {
        const payoutValue = Number(amount.replace(',', '.'));
        const feeValue = Number((bankFee || '0').replace(',', '.'));
        if (!selectedStripePayoutFund || !selectedStripePayoutBank) {
            Alert.alert(t('error', language), t('noFundAccounts', language));
            return;
        }
        if (!Number.isFinite(payoutValue) || payoutValue <= 0) {
            Alert.alert(t('error', language), t('stripePayoutAmountRequired', language));
            return;
        }
        if (!Number.isFinite(feeValue) || feeValue < 0 || feeValue > payoutValue) {
            Alert.alert(t('error', language), t('stripePayoutFeeInvalid', language));
            return;
        }
        setSaving(true);
        try {
            await createStripePayoutSettlement(supabase, {
                companyId: selectedStripePayoutFund.company_id,
                stripeFundAccountId: selectedStripePayoutFund.id,
                bankFundAccountId: selectedStripePayoutBank.id,
                payoutAmount: payoutValue,
                bankFee: feeValue,
                settlementDate: date,
                description,
                idempotencyKey: await generateSettlementIdempotencyKey(),
            });
            setModal(null);
            setAmount('');
            setBankFee('');
            setDate(today());
            setDescription('');
            setStripePayoutFundKey('');
            setStripePayoutBankKey('');
            await loadFunds();
            Alert.alert(t('success', language), t('stripePayoutSaved', language));
        } catch (saveError) {
            console.error('Stripe payout settlement error:', saveError);
            Alert.alert(t('error', language), t('stripePayoutSaveError', language));
        } finally {
            setSaving(false);
        }
    };

    return (
        <MobileScreen testID="cash-balances-screen">
            <MobileHeader title={t('cashBalances', language)} subtitle={t('cashBalancesDescription', language)} onBack={() => navigation.goBack()} />
            {loading ? <LoadingState label={t('loadingCashBalances', language)} /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRetryToken((value) => value + 1); }} /> : (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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
                            : Number(fund.available_balance ?? fund.balance);
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
                                <Text style={[styles.salesTitle, { color: palette.text }]}>{selectedAgentId !== 'all' ? t('agentOutstanding', language) : t('agentSales', language)}</Text>
                                <Text style={[styles.salesDescription, { color: palette.muted }]}>{selectedAgentId !== 'all' ? t('agentOutstandingDescription', language) : t('agentSalesDescription', language)}</Text>
                            </View>
                            <Text style={[styles.salesAmount, { color: agentSalesTotal > 0 ? brand.colors.success : palette.muted }]}>{formatCurrency(agentSalesTotal, 'EUR', language)}</Text>
                        </View>
                        <View style={[styles.salesMeta, { borderTopColor: palette.border }]}>
                            <View><Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('documentsSold', language)}: {agentSales.length}</Text>{selectedAgentId !== 'all' ? <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('settledAmount', language)}: {formatCurrency(agentSettledTotal, 'EUR', language)}</Text> : null}</View>
                            {selectedAgentId !== 'all' && selectedAgent ? <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{agentDisplayName(selectedAgent)}</Text> : null}
                        </View>
                        {selectedAgentId !== 'all' && selectedAgent ? <Button
                            title={t('viewAgentActivity', language)}
                            icon={Activity}
                            size="small"
                            onPress={() => navigation.navigate('AgentActivity', { agentId: selectedAgent.user_id, agentName: agentDisplayName(selectedAgent) })}
                            style={styles.activityButton}
                        /> : null}
                        {selectedAgentId !== 'all' && selectedAgent ? <Button
                            title={t('agentAdvance', language)}
                            icon={WalletCards}
                            size="small"
                            onPress={openAdvance}
                            disabled={settlementFunds.length === 0}
                            style={styles.activityButton}
                        /> : null}
                        {selectedAgentId !== 'all' && selectedAgent ? <Button
                            title={t('settleAgent', language)}
                            icon={HandCoins}
                            size="small"
                            variant="success"
                            onPress={openSettlement}
                            disabled={!settlementsAvailable || agentSalesTotal <= 0 || settlementFunds.length === 0}
                            style={styles.activityButton}
                        /> : null}
                    </View>

                    <View style={[styles.salesCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.salesCardHeader}>
                            <View style={styles.salesCardCopy}>
                                <Text style={[styles.salesTitle, { color: palette.text }]}>{t('postCodBalance', language)}</Text>
                                <Text style={[styles.salesDescription, { color: palette.muted }]}>{t('postCodBalanceDescription', language)}</Text>
                            </View>
                            <Text style={[styles.salesAmount, { color: postCodTotal > 0 ? brand.colors.success : palette.muted }]}>{formatCurrency(postCodTotal, 'EUR', language)}</Text>
                        </View>
                        <View style={[styles.salesMeta, { borderTopColor: palette.border }]}>
                            <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('documentsSold', language)}: {postCodSales.length}</Text>
                            <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('settledAmount', language)}: {formatCurrency(postCodSettledTotal, 'EUR', language)}</Text>
                        </View>
                        <Button
                            title={t('settlePostCod', language)}
                            icon={HandCoins}
                            size="small"
                            variant="success"
                            onPress={openPostCodSettlement}
                            disabled={!postCodSettlementsAvailable || postCodTotal <= 0 || settlementFunds.length === 0}
                            style={styles.activityButton}
                        />
                    </View>

                    {stripeFunds.length > 0 || stripePayoutSettlements.length > 0 ? <View style={[styles.salesCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.salesCardHeader}>
                            <View style={styles.salesCardCopy}>
                                <Text style={[styles.salesTitle, { color: palette.text }]}>{t('stripePayoutBalance', language)}</Text>
                                <Text style={[styles.salesDescription, { color: palette.muted }]}>{t('stripePayoutBalanceDescription', language)}</Text>
                            </View>
                            <Text style={[styles.salesAmount, { color: stripePayoutNetReceivedTotal > 0 ? brand.colors.success : palette.muted }]}>{formatCurrency(stripePayoutNetReceivedTotal, stripePayoutSettlements[0]?.currency || stripeFunds[0]?.currency || 'EUR', language)}</Text>
                        </View>
                        <View style={[styles.salesMeta, { borderTopColor: palette.border }]}>
                            <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('documentsSold', language)}: {stripePayoutSettlements.length}</Text>
                            <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('netReceived', language)}</Text>
                        </View>
                        <Button
                            title={t('reconcileStripePayout', language)}
                            icon={HandCoins}
                            size="small"
                            variant="success"
                            onPress={openStripePayoutSettlement}
                            disabled={!stripePayoutSettlementsAvailable || stripeFunds.length === 0 || settlementFunds.length === 0}
                            style={styles.activityButton}
                        />
                    </View> : null}

                </ScrollView>
            )}

            <Modal visible={modal !== null} animationType="slide" transparent onRequestClose={closeModal}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={[styles.modalCard, { backgroundColor: palette.surface }]}>
                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
                            {modal === 'stripe_payout' ? <>
                                <Text style={[styles.modalTitle, { color: palette.text }]}>{t('stripePayoutSettlementTitle', language)}</Text>
                                <Text style={[styles.modalDescription, { color: palette.muted }]}>{t('stripePayoutSettlementDescription', language)}</Text>
                                <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('selectStripeBalance', language)}</Text>
                                <View style={styles.selectionList}>{stripeFunds.map((fund) => <TouchableOpacity key={fundRowKey(fund)} onPress={() => setStripePayoutFundKey(fundRowKey(fund))} style={[styles.selectionItem, { backgroundColor: stripePayoutFundKey === fundRowKey(fund) ? palette.iconSurface : palette.surfaceMuted }]}><Text style={{ color: palette.text }}>{fund.name} · {tenantNames.get(fund.company_id) || fund.company_id}</Text><Text style={[styles.agentOptionEmail, { color: palette.muted }]}>{t('stripePayoutBalance', language)}</Text></TouchableOpacity>)}</View>
                                <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('selectSettlementFund', language)}</Text>
                                <View style={styles.selectionList}>{settlementFunds.map((fund) => <TouchableOpacity key={fundRowKey(fund)} onPress={() => setStripePayoutBankKey(fundRowKey(fund))} style={[styles.selectionItem, { backgroundColor: stripePayoutBankKey === fundRowKey(fund) ? palette.iconSurface : palette.surfaceMuted }]}><Text style={{ color: palette.text }}>{fund.name} · {tenantNames.get(fund.company_id) || fund.company_id}</Text><Text style={[styles.agentOptionEmail, { color: palette.muted }]}>{fund.fund_type === 'cash' ? t('cashAccount', language) : t('bankAccount', language)}</Text></TouchableOpacity>)}</View>
                                <Input label={t('stripePayoutAmount', language)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                                <Input label={t('bankFee', language)} value={bankFee} onChangeText={setBankFee} keyboardType="decimal-pad" placeholder="0.00" />
                                <View style={[styles.netPreview, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}>
                                    <Text style={[styles.salesMetaLabel, { color: palette.muted }]}>{t('netReceived', language)}</Text>
                                    <Text style={[styles.salesAmount, { color: netReceivedPreview >= 0 ? brand.colors.success : palette.error }]}>{formatCurrency(netReceivedPreview, selectedStripePayoutFund?.currency || 'EUR', language)}</Text>
                                </View>
                                <Input label={t('settlementDate', language)} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
                                <Input label={t('settlementNote', language)} value={description} onChangeText={setDescription} placeholder={t('optional', language)} />
                                <Button title={t('saveStripePayout', language)} onPress={() => void saveStripePayoutSettlement()} loading={saving} variant="success" />
                                <Button title={t('cancel', language)} variant="ghost" onPress={closeModal} disabled={saving} />
                            </> : modal === 'advance' ? <>
                                <Text style={[styles.modalTitle, { color: palette.text }]}>{t('agentAdvanceTitle', language)}</Text>
                                <Text style={[styles.modalDescription, { color: palette.muted }]}>{t('agentAdvanceDescription', language)}</Text>
                                <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('selectSettlementFund', language)}</Text>
                                <View style={styles.selectionList}>{settlementFunds.map((fund) => <TouchableOpacity key={fundRowKey(fund)} onPress={() => setSettlementFundKey(fundRowKey(fund))} style={[styles.selectionItem, { backgroundColor: settlementFundKey === fundRowKey(fund) ? palette.iconSurface : palette.surfaceMuted }]}><Text style={{ color: palette.text }}>{fund.name} · {tenantNames.get(fund.company_id) || fund.company_id}</Text><Text style={[styles.agentOptionEmail, { color: palette.muted }]}>{fund.fund_type === 'cash' ? t('cashAccount', language) : t('bankAccount', language)} · {formatCurrency(Number(fund.available_balance ?? fund.balance), fund.currency, language)}</Text></TouchableOpacity>)}</View>
                                <Input label={t('agentAdvanceAmount', language)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                                <Input label={t('settlementDate', language)} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
                                <Input label={t('settlementNote', language)} value={description} onChangeText={setDescription} placeholder={t('optional', language)} />
                                <Button title={t('saveAgentAdvance', language)} onPress={() => void saveAdvance()} loading={saving} variant="success" />
                                <Button title={t('cancel', language)} variant="ghost" onPress={closeModal} disabled={saving} />
                            </> : modal === 'settlement' ? <>
                                <Text style={[styles.modalTitle, { color: palette.text }]}>{t(settlementTarget === 'post_cod' ? 'postCodSettlementTitle' : 'agentSettlementTitle', language)}</Text>
                                <Text style={[styles.modalDescription, { color: palette.muted }]}>{t(settlementTarget === 'post_cod' ? 'postCodSettlementDescription' : 'agentSettlementDescription', language)}</Text>
                                <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('selectSettlementFund', language)}</Text>
                                <View style={styles.selectionList}>{settlementFunds.map((fund) => <TouchableOpacity key={fundRowKey(fund)} onPress={() => { setSettlementFundKey(fundRowKey(fund)); setAmount((settlementTarget === 'post_cod' ? postCodOutstandingForCompany(fund.company_id) : agentOutstandingForCompany(fund.company_id)).toFixed(2)); }} style={[styles.selectionItem, { backgroundColor: settlementFundKey === fundRowKey(fund) ? palette.iconSurface : palette.surfaceMuted }]}><Text style={{ color: palette.text }}>{fund.name} · {tenantNames.get(fund.company_id) || fund.company_id}</Text><Text style={[styles.agentOptionEmail, { color: palette.muted }]}>{fund.fund_type === 'cash' ? t('cashAccount', language) : t('bankAccount', language)}</Text></TouchableOpacity>)}</View>
                                <Input label={t('settlementAmount', language)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                                <Input label={t('settlementDate', language)} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
                                <Input label={t('settlementNote', language)} value={description} onChangeText={setDescription} placeholder={t('optional', language)} />
                                <Button title={t(settlementTarget === 'post_cod' ? 'settlePostCod' : 'settleAgent', language)} onPress={() => void saveSettlement()} loading={saving} variant="success" />
                                <Button title={t('cancel', language)} variant="ghost" onPress={closeModal} disabled={saving} />
                            </> : <>
                                <Text style={[styles.modalTitle, { color: palette.text }]}>{t('moveMoneyTitle', language)}</Text>
                                <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('fromAccount', language)}</Text>
                                <TouchableOpacity style={[styles.selector, { borderColor: palette.border }]} onPress={() => setSelectionMode('source')}><Text style={{ color: palette.text }}>{selectedSource ? `${selectedSource.name} · ${tenantNames.get(selectedSource.company_id) || selectedSource.company_id}` : t('selectSourceAccount', language)}</Text></TouchableOpacity>
                                <Text style={[styles.fieldLabel, { color: palette.muted }]}>{t('toAccount', language)}</Text>
                                <TouchableOpacity style={[styles.selector, { borderColor: palette.border }]} onPress={() => setSelectionMode('target')}><Text style={{ color: palette.text }}>{selectedTarget ? `${selectedTarget.name} · ${tenantNames.get(selectedTarget.company_id) || selectedTarget.company_id}` : t('selectTargetAccount', language)}</Text></TouchableOpacity>
                                <Text style={[styles.selectionHint, { color: palette.muted }]}>{selectionMode === 'source' ? t('selectSourceAccount', language) : t('selectTargetAccount', language)}</Text>
                                <View style={styles.selectionList}>{funds.map((fund) => { const rowKey = fundRowKey(fund); return <TouchableOpacity key={rowKey} onPress={() => { if (selectionMode === 'source') setSourceId(rowKey); else setTargetId(rowKey); }} style={[styles.selectionItem, { backgroundColor: (selectionMode === 'source' ? sourceId : targetId) === rowKey ? palette.iconSurface : palette.surfaceMuted }]}><Text style={{ color: palette.text }}>{fund.name} · {tenantNames.get(fund.company_id) || fund.company_id} · {formatCurrency(Number(fund.available_balance ?? fund.balance), fund.currency, language)}</Text></TouchableOpacity>; })}</View>
                                <Input label={t('transferAmount', language)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                                <Input label={t('transferDate', language)} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
                                <Input label={t('transferDescription', language)} value={description} onChangeText={setDescription} placeholder={t('optional', language)} />
                                <Button title={t('transfer', language)} onPress={() => void saveTransfer()} loading={saving} />
                                <Button title={t('cancel', language)} variant="ghost" onPress={closeModal} disabled={saving} />
                            </>}
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
    modalDescription: { fontSize: 12, lineHeight: 18, marginTop: -10, marginBottom: 4 },
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
    netPreview: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selector: { borderWidth: 1, borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 14 },
    selectionHint: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 12 },
    selectionList: { gap: 7, marginTop: 7, marginBottom: 6 },
    selectionItem: { minHeight: 40, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 },
});
