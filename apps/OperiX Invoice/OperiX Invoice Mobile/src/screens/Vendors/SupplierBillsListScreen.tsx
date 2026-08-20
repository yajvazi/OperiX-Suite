import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Plus, Building, Calendar, FileText, Trash2, Edit2 } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button } from '@invoice-monorepo/ui';
import { formatCurrency, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { SupplierBill } from '@invoice-monorepo/types';
import { getWorkspaceScope, scopedResource } from '../../services/workspace';
import { MobileHeader, MobileScreen, SearchField } from '../../components/mobile/MobileUI';

function supplierBillStatusLabel(status: string, language: string): string {
    const labels: Record<string, string> = {
        paid: t('paid', language),
        partial: t('partiallyPaid', language),
        pending: t('pending', language),
        overdue: t('overdue', language),
        draft: t('draft', language),
    };
    return labels[status] || status;
}

export function SupplierBillsListScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const [bills, setBills] = useState<SupplierBill[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';

    useEffect(() => {
        fetchBills();
    }, []);

    const fetchBills = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { companyIds } = await getWorkspaceScope(user.id);
            const scope = scopedResource(user.id, companyIds);

            const { data, error } = await supabase
                .from('supplier_bills')
                .select('*, vendor:vendors(name)')
                .or(scope)
                .order('issue_date', { ascending: false });

            if (error) throw error;
            setBills(data || []);
        } catch (error: any) {
            console.error('Error fetching bills:', error);
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleDelete = async (id: string) => {
        Alert.alert(
            t('confirmDelete', language),
            t('deleteSupplierBillConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('delete', language),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase.from('supplier_bills').delete().eq('id', id);
                            if (error) throw error;
                            setBills(bills.filter(b => b.id !== id));
                        } catch (error: any) {
                            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
                        }
                    }
                }
            ]
        );
    };

    const filteredBills = bills.filter(bill =>
        bill.bill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bill.vendor?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderBill = ({ item }: { item: SupplierBill }) => (
        <Card style={styles.billCard}>
            <View style={styles.billHeader}>
                <View style={[styles.vendorIcon, { backgroundColor: primaryColor + '15' }]}>
                    <Building color={primaryColor} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.vendorName, { color: textColor }]}>{item.vendor?.name || t('unknownVendor', language)}</Text>
                    <Text style={[styles.billNumber, { color: mutedColor }]}>#{item.bill_number}</Text>
                </View>
                <View style={styles.amountContainer}>
                    <Text style={[styles.amount, { color: textColor }]}>{formatCurrency(item.total_amount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: item.status === 'paid' ? '#12B76A' : (item.status === 'partial' ? '#f59e0b' : '#ef4444') + '20' }]}>
                        <Text style={[styles.statusText, { color: item.status === 'paid' ? '#12B76A' : (item.status === 'partial' ? '#f59e0b' : '#ef4444') }]}>
                            {supplierBillStatusLabel(item.status, language)}
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.billFooter}>
                <View style={styles.footerItem}>
                    <Calendar color={mutedColor} size={14} />
                    <Text style={[styles.footerText, { color: mutedColor }]}>{item.issue_date}</Text>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity onPress={() => navigation.navigate('SupplierBillForm', { billId: item.id })} style={styles.actionBtn}>
                        <Edit2 color={primaryColor} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                        <Trash2 color="#ef4444" size={18} />
                    </TouchableOpacity>
                </View>
            </View>
        </Card>
    );

    return (
        <MobileScreen>
            <MobileHeader
                title={t('supplierBills', language)}
                subtitle={t('management', language)}
                onBack={() => navigation.goBack()}
                right={(
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('addSupplierBill', language)}
                        onPress={() => navigation.navigate('SupplierBillForm')}
                        style={[styles.addButton, { backgroundColor: cardBg }]}
                    >
                        <Plus color={primaryColor} size={24} />
                    </TouchableOpacity>
                )}
            />

            <View style={styles.content}>
                <View style={styles.searchBar}>
                    <SearchField
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={t('search', language)}
                    />
                </View>

                {loading ? (
                    <ActivityIndicator color={primaryColor} size="large" style={{ marginTop: 40 }} />
                ) : (
                    <FlatList
                        data={filteredBills}
                        keyExtractor={(item) => item.id}
                        renderItem={renderBill}
                        contentContainerStyle={styles.listContent}
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); fetchBills(); }}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <FileText color={mutedColor} size={48} />
                                <Text style={{ color: mutedColor, marginTop: 12 }}>{t('noSupplierBillsFound', language)}</Text>
                                <Button
                                    title={t('newSupplierBill', language)}
                                    onPress={() => navigation.navigate('SupplierBillForm')}
                                    style={{ marginTop: 20 }}
                                />
                            </View>
                        }
                    />
                )}
            </View>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    addButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    content: { flex: 1, paddingHorizontal: 16 },
    searchBar: { marginBottom: 16 },
    listContent: { paddingBottom: 100 },
    billCard: { padding: 16, marginBottom: 16 },
    billHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    vendorIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    vendorName: { fontSize: 16, fontWeight: 'bold' },
    billNumber: { fontSize: 13, marginTop: 2 },
    amountContainer: { alignItems: 'flex-end' },
    amount: { fontSize: 16, fontWeight: 'bold' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4 },
    statusText: { fontSize: 10, fontWeight: 'bold' },
    billFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerText: { fontSize: 13 },
    actions: { flexDirection: 'row', gap: 16 },
    actionBtn: { padding: 4 },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
});
