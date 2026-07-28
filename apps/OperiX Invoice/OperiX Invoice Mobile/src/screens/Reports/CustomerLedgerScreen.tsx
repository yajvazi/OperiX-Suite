import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    TextInput,
    FlatList,
} from 'react-native';
import { ArrowLeft, Download, User, FileText, CreditCard, TrendingUp, Search, X } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { Button, Card } from '@invoice-monorepo/ui';
import { t } from '@invoice-monorepo/i18n';
import { formatCurrency } from '@invoice-monorepo/i18n';
import { Client, Profile } from '@invoice-monorepo/types';
import {
    buildCustomerLedger,
    renderCustomerLedgerHtml,
    type CustomerLedgerEntry,
    type CustomerLedgerInvoice,
    type CustomerLedgerPayment,
} from '@invoice-monorepo/report-templates';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const LEDGER_RANGE = { from: '1900-01-01', to: '9999-12-31' };

export function CustomerLedgerScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const preselectedClientId = route.params?.clientId;

    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [filteredClients, setFilteredClients] = useState<Client[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string | null>(preselectedClientId || null);
    const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
    const [totals, setTotals] = useState({ debit: 0, credit: 0, balance: 0 });
    const [ledgerSummary, setLedgerSummary] = useState({
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
        totalPayments: 0,
    });

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedClientId) {
            fetchLedgerData();
        }
    }, [selectedClientId]);

    useEffect(() => {
        if (searchQuery) {
            const filtered = clients.filter(c =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.phone?.includes(searchQuery)
            );
            setFilteredClients(filtered);
        } else {
            setFilteredClients(clients);
        }
    }, [searchQuery, clients]);

    const fetchInitialData = async () => {
        if (!user) return;

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profileData) {
            setProfile(profileData);
            const companyId = profileData.active_company_id || profileData.company_id || user.id;

            const { data: clientsData } = await supabase
                .from('clients')
                .select('*')
                .or(`user_id.eq.${user.id},company_id.eq.${companyId}`)
                .order('name');
            if (clientsData) {
                setClients(clientsData);
                setFilteredClients(clientsData);
            }
        }
        setLoading(false);
    };

    const fetchLedgerData = async () => {
        if (!selectedClientId || !user) return;
        setLoading(true);

        try {
            const { data: invoices } = await supabase
                .from('invoices')
                .select('id, invoice_number, issue_date, status, type, subtype, total_amount, payment_method, notes, created_at')
                .eq('client_id', selectedClientId)
                .order('issue_date', { ascending: true });

            const { data: payments } = await supabase
                .from('payments')
                .select('id, payment_number, payment_date, amount, payment_method, bank_reference, notes, invoice_id, created_at, invoice:invoices(invoice_number)')
                .eq('client_id', selectedClientId)
                .order('payment_date', { ascending: true });

            const normalizedPayments = (payments || []).map((payment: any) => ({
                ...payment,
                invoice_number: Array.isArray(payment.invoice)
                    ? payment.invoice[0]?.invoice_number
                    : payment.invoice?.invoice_number,
            })) as CustomerLedgerPayment[];
            const ledger = buildCustomerLedger({
                invoices: (invoices || []) as CustomerLedgerInvoice[],
                payments: normalizedPayments,
                customerName: clients.find(client => client.id === selectedClientId)?.name || '—',
                organizationUnit: profile?.company_name || '—',
                userName: profile?.email || '—',
                ...LEDGER_RANGE,
            });

            setLedgerEntries(ledger.entries);
            setLedgerSummary({
                openingBalance: ledger.openingBalance,
                totalDebit: ledger.totalDebit,
                totalCredit: ledger.totalCredit,
                closingBalance: ledger.closingBalance,
                totalPayments: ledger.totalPayments,
            });
            setTotals({
                debit: ledger.totalDebit,
                credit: ledger.totalCredit,
                balance: ledger.closingBalance,
            });
        } catch (error) {
            console.error('Error fetching ledger data:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectedClient = clients.find(c => c.id === selectedClientId);

    const handleExportPDF = async () => {
        if (!selectedClient || !profile) return;
        setExporting(true);
        try {
            const html = renderCustomerLedgerHtml({
                customer: {
                    name: selectedClient.name,
                    taxId: selectedClient.tax_id,
                    email: selectedClient.email,
                    phone: selectedClient.phone,
                    address: [
                        selectedClient.address,
                        selectedClient.city,
                        selectedClient.zip_code,
                        selectedClient.country,
                    ].filter(Boolean).join(', '),
                },
                company: {
                    name: profile.company_name || 'Company',
                    taxId: profile.tax_id,
                    email: profile.email,
                    phone: profile.phone,
                    address: [profile.address, profile.city, profile.country].filter(Boolean).join(', '),
                    website: profile.website,
                    bankName: profile.bank_name,
                    iban: profile.bank_iban || profile.bank_account,
                    logoUrl: profile.logo_url,
                },
                range: LEDGER_RANGE,
                summary: ledgerSummary,
                entries: ledgerEntries,
            });
            const { uri } = await Print.printToFileAsync({ html, base64: false });
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: `Kartela - ${selectedClient.name}`,
                UTI: 'com.adobe.pdf',
            });
        } catch (error: any) {
            Alert.alert(t('error', language), 'Failed to export PDF: ' + error.message);
        } finally {
            setExporting(false);
        }
    };

    if (!selectedClientId) {
        return (
            <View style={[styles.container, { backgroundColor: bgColor }]}>
                <View style={[styles.mainHeader, { borderBottomColor: borderColor }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: cardBg }]}>
                        <ArrowLeft color={textColor} size={24} />
                    </TouchableOpacity>
                    <Text style={[styles.mainTitle, { color: textColor }]}>{t('customerCard', language)}</Text>
                    <View style={{ width: 44 }} />
                </View>

                <View style={styles.content}>
                    <View style={[styles.searchContainer, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
                        <Search color={mutedColor} size={20} />
                        <TextInput
                            style={[styles.searchInput, { color: textColor }]}
                            placeholder={t('search', language)}
                            placeholderTextColor={mutedColor}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <X color={mutedColor} size={18} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {loading ? (
                        <ActivityIndicator color={primaryColor} size="large" style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={filteredClients}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.clientListItem, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}
                                    onPress={() => setSelectedClientId(item.id)}
                                >
                                    <View style={[styles.clientIcon, { backgroundColor: `${primaryColor}15` }]}>
                                        <User color={primaryColor} size={24} />
                                    </View>
                                    <View>
                                        <Text style={[styles.clientNameHeader, { color: textColor }]}>{item.name}</Text>
                                        {item.email && <Text style={{ color: mutedColor, fontSize: 13 }}>{item.email}</Text>}
                                    </View>
                                </TouchableOpacity>
                            )}
                            contentContainerStyle={{ paddingBottom: 20, gap: 12 }}
                            ListEmptyComponent={
                                <Text style={[styles.emptyText, { color: mutedColor }]}>No clients found</Text>
                            }
                        />
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={[styles.mainHeader, { borderBottomColor: borderColor }]}>
                <TouchableOpacity onPress={() => setSelectedClientId(null)} style={[styles.backButton, { backgroundColor: cardBg }]}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={[styles.mainTitle, { color: textColor, fontSize: 18 }]} numberOfLines={1}>{selectedClient?.name}</Text>
                    <Text style={{ color: mutedColor, fontSize: 12 }}>Customer Ledger</Text>
                </View>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: cardBg }]}
                    onPress={handleExportPDF}
                    disabled={exporting}
                >
                    <Download color={exporting ? mutedColor : primaryColor} size={20} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {loading ? (
                    <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 40 }} />
                ) : (
                    <>
                        <View style={styles.metricsRow}>
                            <Card style={[styles.metricCard, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
                                <FileText color="#ef4444" size={20} />
                                <View>
                                    <Text style={[styles.metricLabel, { color: mutedColor }]}>DEBIT</Text>
                                    <Text style={[styles.metricValue, { color: '#ef4444' }]}>{formatCurrency(totals.debit)}</Text>
                                </View>
                            </Card>
                            <Card style={[styles.metricCard, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
                                <CreditCard color="#12B76A" size={20} />
                                <View>
                                    <Text style={[styles.metricLabel, { color: mutedColor }]}>CREDIT</Text>
                                    <Text style={[styles.metricValue, { color: '#12B76A' }]}>{formatCurrency(totals.credit)}</Text>
                                </View>
                            </Card>
                        </View>
                        <Card style={[styles.metricCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, marginBottom: 20 }]}>
                            <TrendingUp color={primaryColor} size={24} />
                            <View>
                                <Text style={[styles.metricLabel, { color: mutedColor }]}>CURRENT BALANCE</Text>
                                <Text style={[styles.metricValue, { color: primaryColor, fontSize: 24 }]}>{formatCurrency(totals.balance)}</Text>
                            </View>
                        </Card>

                        <Card style={[styles.tableCard, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
                            <View style={[styles.tableHeader, { backgroundColor: primaryColor }]}>
                                <Text style={[styles.th, { flex: 1.2 }]}>DATE</Text>
                                <Text style={[styles.th, { flex: 2.5 }]}>DESCRIPTION</Text>
                                <Text style={[styles.th, styles.thRight, { flex: 1.3 }]}>DEBIT</Text>
                                <Text style={[styles.th, styles.thRight, { flex: 1.3 }]}>CREDIT</Text>
                                <Text style={[styles.th, styles.thRight, { flex: 1.3 }]}>BAL</Text>
                            </View>

                            {ledgerEntries.length === 0 ? (
                                <Text style={[styles.emptyText, { color: mutedColor }]}>No transactions found</Text>
                            ) : (
                                ledgerEntries.map((entry, idx) => (
                                    <View
                                        key={entry.id}
                                        style={[
                                            styles.tableRow,
                                            { backgroundColor: idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.5)') },
                                            { borderBottomWidth: idx === ledgerEntries.length - 1 ? 0 : 1, borderBottomColor: borderColor }
                                        ]}
                                    >
                                        <Text style={[styles.td, { flex: 1.2, color: mutedColor }]}>
                                            {new Date(entry.date).toLocaleDateString(language === 'sq' ? 'sq-AL' : 'en-US')}
                                        </Text>
                                        <Text style={[styles.td, { flex: 2.5, color: textColor }]} numberOfLines={1}>
                                            {entry.description}
                                        </Text>
                                        <Text style={[styles.td, styles.tdRight, { flex: 1.3, color: entry.debit > 0 ? '#ef4444' : mutedColor }]}>
                                            {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                                        </Text>
                                        <Text style={[styles.td, styles.tdRight, { flex: 1.3, color: entry.credit > 0 ? '#12B76A' : mutedColor }]}>
                                            {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                                        </Text>
                                        <Text style={[styles.td, styles.tdRight, { flex: 1.3, color: textColor, fontWeight: '700' }]}>
                                            {formatCurrency(entry.balance)}
                                        </Text>
                                    </View>
                                ))
                            )}
                        </Card>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    mainHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    mainTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
    actionBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

    content: { padding: 20, paddingBottom: 40 },

    searchContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, gap: 12 },
    searchInput: { flex: 1, fontSize: 16, fontWeight: '500' },

    clientListItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, gap: 16 },
    clientIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    clientNameHeader: { fontSize: 16, fontWeight: '700', marginBottom: 2 },

    metricsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    metricCard: { flex: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16 },
    metricLabel: { fontSize: 11, fontWeight: '700', opacity: 0.7, marginBottom: 2 },
    metricValue: { fontSize: 16, fontWeight: '800' },

    tableCard: { borderRadius: 16, overflow: 'hidden' },
    tableHeader: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12 },
    th: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    thRight: { textAlign: 'right' },
    tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12 },
    td: { fontSize: 12, fontWeight: '500' },
    tdRight: { textAlign: 'right', fontFamily: 'monospace' },

    emptyText: { padding: 40, textAlign: 'center', fontSize: 14, fontWeight: '500' },
});


