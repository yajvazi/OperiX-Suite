import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Banknote, CalendarDays, CircleAlert, FileText, ShieldCheck } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { getPalette } from '../../theme/brand';

type Row = Record<string, any>;

export function PayrollScreen() {
    const { user } = useAuth();
    const { isDark } = useTheme();
    const palette = getPalette(isDark);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [runs, setRuns] = useState<Row[]>([]);
    const [payslips, setPayslips] = useState<Row[]>([]);
    const [liabilities, setLiabilities] = useState<Row[]>([]);

    const load = useCallback(async () => {
        if (!user) return;
        setError('');
        const { data: profile } = await supabase
            .from('profiles')
            .select('active_company_id,company_id')
            .eq('id', user.id)
            .single();
        const companyId = profile?.active_company_id || profile?.company_id;
        if (!companyId) {
            setError('No active OperiX company is selected.');
            setLoading(false);
            return;
        }
        const [runResult, payslipResult, liabilityResult] = await Promise.all([
            supabase.from('payroll_runs').select('id,run_number,status,total_gross,total_net,total_tax,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(8),
            supabase.from('payslip_snapshots').select('id,language,snapshot,generated_at,revoked_at').eq('company_id', companyId).order('generated_at', { ascending: false }).limit(24),
            supabase.from('payroll_liabilities').select('id,liability_type,amount,paid_amount,status').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50),
        ]);
        const firstError = runResult.error || payslipResult.error || liabilityResult.error;
        if (firstError && !payslipResult.data?.length) setError(firstError.message);
        setRuns((runResult.data || []) as Row[]);
        setPayslips((payslipResult.data || []) as Row[]);
        setLiabilities((liabilityResult.data || []) as Row[]);
        setLoading(false);
    }, [user]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));
    const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
    const format = (value: unknown) => new Intl.NumberFormat('en-XK', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
    const latest = runs[0];
    const openLiability = liabilities.reduce((total, row) => total + Number(row.amount || 0) - Number(row.paid_amount || 0), 0);

    if (loading) return <View style={[styles.center, { backgroundColor: palette.background }]}><ActivityIndicator color="#004FFE" /></View>;
    return <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text style={[styles.eyebrow, { color: '#004FFE' }]}>OPERIX INVOICE</Text>
        <Text style={[styles.title, { color: palette.text }]}>Payroll</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>Secure payroll status, approvals, liabilities and your immutable payslips.</Text>
        {error ? <View style={[styles.warning, { borderColor: '#fecdca' }]}><CircleAlert color="#d92d20" size={18}/><Text style={{ color: '#d92d20', flex: 1 }}>{error}</Text></View> : null}
        <View style={styles.grid}>
            <Metric icon={Banknote} label="Latest net payroll" value={format(latest?.total_net)} palette={palette}/>
            <Metric icon={CalendarDays} label="Latest run status" value={String(latest?.status || 'No run')} palette={palette}/>
            <Metric icon={ShieldCheck} label="Open liabilities" value={format(openLiability)} palette={palette}/>
            <Metric icon={FileText} label="Accessible payslips" value={String(payslips.length)} palette={palette}/>
        </View>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Payslips</Text>
        {payslips.length === 0 ? <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}><Text style={{ color: palette.muted }}>No payroll-owned payslip is available for this account.</Text></View> : payslips.map((row) => {
            const snapshot = row.snapshot || {};
            return <View key={row.id} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={styles.row}><View><Text style={[styles.cardTitle, { color: palette.text }]}>{snapshot.runNumber || 'Payslip'}</Text><Text style={{ color: palette.muted, fontSize: 12 }}>{snapshot.period?.name || row.generated_at}</Text></View><Text style={[styles.net, { color: '#004FFE' }]}>{format(snapshot.netSalary)}</Text></View>
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 10 }}>Generated by OperiX Invoice · immutable snapshot</Text>
            </View>;
        })}
        <View style={[styles.warning, { borderColor: palette.border }]}><ShieldCheck color="#004FFE" size={18}/><Text style={{ color: palette.muted, flex: 1 }}>Sensitive setup, calculation, finalization and bank exports remain available only to explicitly authorized payroll roles on desktop.</Text></View>
    </ScrollView>;
}

function Metric({ icon: Icon, label, value, palette }: { icon: any; label: string; value: string; palette: any }) {
    return <View style={[styles.metric, { backgroundColor: palette.surface, borderColor: palette.border }]}><Icon size={19} color="#004FFE"/><Text style={{ color: palette.muted, fontSize: 11, marginTop: 12 }}>{label}</Text><Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingTop: 54, paddingBottom: 120 },
    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
    title: { fontSize: 32, fontWeight: '700', marginTop: 6 },
    subtitle: { fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    metric: { width: '48%', minHeight: 132, padding: 15, borderWidth: 1, borderRadius: 14 },
    metricValue: { fontSize: 17, fontWeight: '700', marginTop: 6, textTransform: 'capitalize' },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 28, marginBottom: 10 },
    card: { padding: 16, borderWidth: 1, borderRadius: 14, marginBottom: 10 },
    cardTitle: { fontWeight: '700', fontSize: 15 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    net: { fontSize: 17, fontWeight: '700' },
    warning: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 18 },
});
