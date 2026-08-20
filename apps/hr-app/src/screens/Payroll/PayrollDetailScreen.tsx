import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Banknote, CalendarDays, FileCheck2, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency } from '@invoice-monorepo/i18n';
import { supabase } from '@invoice-monorepo/api';
import { Card } from '@invoice-monorepo/ui';

export function PayrollDetailScreen({ navigation, route }: any) {
  const { isDark } = useTheme();
  const payslip = route.params?.payslip;
  const [snapshot, setSnapshot] = useState<Record<string, any>>(payslip?.snapshot || {});
  const [loading, setLoading] = useState(Boolean(payslip?.id));
  const colors = { bg: isDark ? '#0f172a' : '#f8fafc', card: isDark ? '#1e293b' : '#fff', text: isDark ? '#fff' : '#1e293b', muted: isDark ? '#94a3b8' : '#64748b', border: isDark ? '#334155' : '#e4e9f0' };

  useEffect(() => {
    if (!payslip?.id) { setLoading(false); return; }
    void (async () => {
      const { data, error } = await supabase.rpc('access_payroll_payslip', { p_payslip_id: payslip.id, p_access_type: 'view' });
      if (error) Alert.alert('Unable to open payslip', error.message);
      if (data?.snapshot) setSnapshot(data.snapshot);
      setLoading(false);
    })();
  }, [payslip?.id]);

  if (!payslip) return <View style={[styles.center, { backgroundColor: colors.bg }]}><Text style={{ color: colors.muted }}>Payslip not found.</Text></View>;
  const currency = String(snapshot.currency || snapshot.details?.currency || 'EUR');
  const value = (...keys: string[]) => { for (const key of keys) { if (snapshot[key] !== undefined && snapshot[key] !== null) return Number(snapshot[key]) || 0; } return 0; };
  const gross = value('grossPay', 'gross', 'gross_salary');
  const tax = value('personalIncomeTax', 'taxes', 'tax');
  const deductions = value('otherDeductions', 'deductions');
  const net = value('netSalary', 'net', 'net_salary');
  const employerCost = value('employerCost');

  if (loading) return <View style={[styles.center, { backgroundColor: colors.bg }]}><ActivityIndicator color="#004FFE" size="large" /></View>;
  return <View style={[styles.container, { backgroundColor: colors.bg }]}><View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><ArrowLeft color={colors.text} size={22} /></TouchableOpacity><View><Text style={[styles.kicker, { color: '#004FFE' }]}>PRIVATE PAYSLIP</Text><Text style={[styles.title, { color: colors.text }]}>Payslip details</Text></View><LockKeyhole color={colors.muted} size={19} /></View><ScrollView contentContainerStyle={styles.content}><Card style={[styles.hero, { backgroundColor: '#004FFE' }]}><FileCheck2 color="#fff" size={23} /><Text style={styles.heroLabel}>Net salary</Text><Text style={styles.heroValue}>{formatCurrency(net, currency)}</Text><Text style={styles.heroMeta}>{String(snapshot.runNumber || payslip.verification_reference || 'Payroll period')}</Text></Card><Card style={[styles.card, { backgroundColor: colors.card }]}><Line label="Gross salary" value={formatCurrency(gross, currency)} icon={<Banknote size={15} color="#004FFE" />} colors={colors} /><Line label="Taxes" value={formatCurrency(tax, currency)} icon={<ShieldCheck size={15} color="#c43d53" />} colors={colors} /><Line label="Other deductions" value={formatCurrency(deductions, currency)} icon={<ShieldCheck size={15} color="#b97709" />} colors={colors} /><Line label="Employer cost" value={formatCurrency(employerCost, currency)} icon={<Banknote size={15} color="#138a62" />} colors={colors} /></Card><Card style={[styles.card, { backgroundColor: colors.card }]}><Line label="Generated" value={payslip.generated_at ? new Date(payslip.generated_at).toLocaleDateString() : '—'} icon={<CalendarDays size={15} color="#6c4ed9" />} colors={colors} /><Line label="Language" value={payslip.language || 'en'} icon={<FileCheck2 size={15} color="#004FFE" />} colors={colors} /><Text style={[styles.note, { color: colors.muted }]}>This payslip is a finalized snapshot. Changes must go through the authorized payroll workflow.</Text></Card></ScrollView></View>;
}

function Line({ label, value, icon, colors }: { label: string; value: string; icon: React.ReactNode; colors: { text: string; muted: string; border: string } }) { return <View style={[styles.line, { borderBottomColor: colors.border }]}><View style={styles.lineIcon}>{icon}</View><Text style={[styles.lineLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.lineValue, { color: colors.text }]}>{value}</Text></View>; }
const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 56, paddingBottom: 13 }, back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4, textAlign: 'center' }, title: { marginTop: 3, fontSize: 20, fontWeight: '800' }, content: { padding: 15, paddingBottom: 36 }, hero: { padding: 20, borderRadius: 17 }, heroLabel: { marginTop: 18, color: 'rgba(255,255,255,.76)', fontSize: 12, fontWeight: '700' }, heroValue: { marginTop: 5, color: '#fff', fontSize: 31, fontWeight: '800' }, heroMeta: { marginTop: 13, color: 'rgba(255,255,255,.78)', fontSize: 11 }, card: { marginTop: 14, padding: 14, borderRadius: 14 }, line: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth }, lineIcon: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#edf3ff' }, lineLabel: { flex: 1, fontSize: 11 }, lineValue: { fontSize: 12, fontWeight: '800' }, note: { marginTop: 13, fontSize: 10, lineHeight: 16 } });
