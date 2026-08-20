import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Banknote, FileText, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency } from '@invoice-monorepo/i18n';
import { resolveWorkspace, supabase } from '@invoice-monorepo/api';
import { Card } from '@invoice-monorepo/ui';

type PayrollRun = { id: string; run_number?: string | null; status?: string | null; currency?: string | null; total_gross?: number | null; total_net?: number | null; total_tax?: number | null; created_at?: string | null };
type Payslip = { id: string; payroll_run_id?: string | null; language?: string | null; verification_reference?: string | null; snapshot?: Record<string, unknown> | null; generated_at?: string | null; revoked_at?: string | null };

export function PayrollDashboardScreen({ navigation }: any) {
  const { isDark } = useTheme();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const colors = { bg: isDark ? '#0f172a' : '#f8fafc', card: isDark ? '#1e293b' : '#fff', text: isDark ? '#fff' : '#1e293b', muted: isDark ? '#94a3b8' : '#64748b', border: isDark ? '#334155' : '#e4e9f0' };

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setRefreshing(true);
    try {
      const workspace = await resolveWorkspace(supabase, user.id);
      const [runResult, payslipResult] = await Promise.all([
        supabase.from('payroll_runs').select('id,run_number,status,currency,total_gross,total_net,total_tax,created_at').eq('company_id', workspace.companyId).order('created_at', { ascending: false }).limit(20),
        supabase.from('payslip_snapshots').select('id,payroll_run_id,language,verification_reference,snapshot,generated_at,revoked_at').eq('company_id', workspace.companyId).order('generated_at', { ascending: false }).limit(30),
      ]);
      if (runResult.error && payslipResult.error) throw runResult.error;
      setRuns((runResult.data || []) as PayrollRun[]);
      setPayslips((payslipResult.data || []) as Payslip[]);
    } catch (error) {
      console.warn('Unable to load secure payroll records', error);
      setRuns([]); setPayslips([]);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));
  const totals = useMemo(() => runs.reduce((result, run) => ({ gross: result.gross + Number(run.total_gross || 0), net: result.net + Number(run.total_net || 0), tax: result.tax + Number(run.total_tax || 0) }), { gross: 0, net: 0, tax: 0 }), [runs]);
  const currency = runs[0]?.currency || 'EUR';

  if (loading) return <View style={[styles.center, { backgroundColor: colors.bg }]}><ActivityIndicator color="#004FFE" size="large" /></View>;
  return <View style={[styles.container, { backgroundColor: colors.bg }]}>
    <View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><ArrowLeft color={colors.text} size={22} /></TouchableOpacity><View><Text style={[styles.kicker, { color: '#004FFE' }]}>COMPENSATION</Text><Text style={[styles.title, { color: colors.text }]}>Payroll</Text></View><View style={{ width: 38 }} /></View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor="#004FFE" />}>
      <View style={styles.statGrid}><Stat label="Payroll runs" value={runs.length} icon={<FileText size={17} color="#004FFE" />} colors={colors} /><Stat label="Gross total" value={runs.length ? formatCurrency(totals.gross, currency) : '—'} icon={<Banknote size={17} color="#138a62" />} colors={colors} /><Stat label="Net total" value={runs.length ? formatCurrency(totals.net, currency) : '—'} icon={<ShieldCheck size={17} color="#6c4ed9" />} colors={colors} /><Stat label="My payslips" value={payslips.length} icon={<LockKeyhole size={17} color="#b97709" />} colors={colors} /></View>
      <Card style={[styles.card, { backgroundColor: colors.card }]}><View style={styles.cardHeader}><Text style={[styles.cardTitle, { color: colors.text }]}>Payroll periods</Text><Text style={[styles.cardAction, { color: colors.muted }]}>Server-authorized</Text></View>{runs.length ? runs.map((run) => <View key={run.id} style={[styles.row, { borderBottomColor: colors.border }]}><View style={styles.rowIcon}><FileText size={14} color="#004FFE" /></View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.text }]}>{run.run_number || run.id.slice(0, 8)}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>{run.status || 'draft'} · {run.created_at ? new Date(run.created_at).toLocaleDateString() : '—'}</Text></View><Text style={[styles.rowAmount, { color: colors.text }]}>{formatCurrency(run.total_net || 0, run.currency || currency)}</Text></View>) : <Text style={[styles.empty, { color: colors.muted }]}>No authorized payroll runs are available.</Text>}</Card>
      <Card style={[styles.card, { backgroundColor: colors.card }]}><View style={styles.cardHeader}><Text style={[styles.cardTitle, { color: colors.text }]}>My payslips</Text><Text style={[styles.cardAction, { color: colors.muted }]}>Private access</Text></View>{payslips.length ? payslips.map((payslip) => <TouchableOpacity key={payslip.id} style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('PayrollDetail', { payslip })}><View style={[styles.rowIcon, { backgroundColor: '#fff7e5' }]}><Banknote size={14} color="#b97709" /></View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.text }]}>{String(payslip.snapshot?.runNumber || payslip.verification_reference || 'Payslip')}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>{payslip.generated_at ? new Date(payslip.generated_at).toLocaleDateString() : 'Generated'}{payslip.revoked_at ? ' · Revoked' : ''}</Text></View><Text style={[styles.viewText, { color: '#004FFE' }]}>View</Text></TouchableOpacity>) : <Text style={[styles.empty, { color: colors.muted }]}>Your payslips will appear after an authorized payroll run is finalized.</Text>}</Card>
    </ScrollView>
  </View>;
}

function Stat({ label, value, icon, colors }: { label: string; value: number | string; icon: React.ReactNode; colors: { card: string; text: string; muted: string } }) { return <View style={[styles.stat, { backgroundColor: colors.card }]}><View style={styles.statIcon}>{icon}</View><Text style={[styles.statValue, { color: colors.text }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text></View>; }
const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 56, paddingBottom: 13 }, back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4, textAlign: 'center' }, title: { marginTop: 3, fontSize: 20, fontWeight: '800' }, content: { padding: 15, paddingBottom: 36 }, statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, stat: { width: '48%', padding: 13, borderRadius: 13 }, statIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#eef3ff' }, statValue: { marginTop: 9, fontSize: 17, fontWeight: '800' }, statLabel: { marginTop: 3, fontSize: 10 }, card: { marginTop: 14, padding: 14, borderRadius: 14 }, cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, cardTitle: { fontSize: 14, fontWeight: '800' }, cardAction: { fontSize: 10 }, row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth }, rowIcon: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#edf3ff' }, rowTitle: { fontSize: 11, fontWeight: '700' }, rowMeta: { marginTop: 3, fontSize: 9, textTransform: 'capitalize' }, rowAmount: { fontSize: 11, fontWeight: '800' }, viewText: { fontSize: 11, fontWeight: '800' }, empty: { paddingVertical: 22, textAlign: 'center', fontSize: 11, lineHeight: 17 } });
