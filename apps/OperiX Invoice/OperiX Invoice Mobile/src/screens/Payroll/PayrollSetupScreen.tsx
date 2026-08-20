import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarDays, ChevronRight, ShieldCheck, Users } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { Input } from '@invoice-monorepo/ui';
import { getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import { brand, getPalette } from '../../theme/brand';
import type { RootStackParamList } from '../../navigation/types';

type Row = Record<string, any>;
type Panel = 'access' | 'employee' | 'period' | 'rules';

export function PayrollSetupScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [companyId, setCompanyId] = useState('');
    const [employees, setEmployees] = useState<Row[]>([]);
    const [branches, setBranches] = useState<Row[]>([]);
    const [periods, setPeriods] = useState<Row[]>([]);
    const [configs, setConfigs] = useState<Row[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<Row | null>(null);
    const [panel, setPanel] = useState<Panel>('access');
    const [saving, setSaving] = useState(false);
    const [accessReason, setAccessReason] = useState('');
    const [employeeForm, setEmployeeForm] = useState({ number: '', branch: '', basis: 'gross-monthly', amount: '', hours: '', days: '', effectiveFrom: new Date().toISOString().slice(0, 10), taxStatus: 'standard', pensionStatus: 'standard', iban: '', bank: '', reason: '' });
    const [periodForm, setPeriodForm] = useState({ code: '', name: '', starts: '', ends: '', payment: '' });
    const [rulesForm, setRulesForm] = useState({ name: '', from: new Date().toISOString().slice(0, 10), until: '', source: '', rounding: 'half-up', brackets: '[{"sequence":1,"lowerBound":"0","upperBound":null,"ratePercent":"0","fixedAmount":"0"}]', employeePension: '', employerPension: '', reason: '' });

    const load = useCallback(async () => {
        if (!user) return;
        const { data: profile } = await supabase.from('profiles').select('active_company_id,company_id').eq('id', user.id).single();
        const id = profile?.active_company_id || profile?.company_id;
        if (!id) return;
        setCompanyId(id);
        const [employeeResult, branchResult, periodResult, configResult] = await Promise.all([
            supabase.from('employees').select('id,first_name,last_name,employee_number,branch_id,payroll_ready_status').eq('company_id', id).order('first_name'),
            supabase.from('branches').select('id,name,code').eq('company_id', id).eq('is_active', true).order('name'),
            supabase.from('payroll_periods').select('id,code,name,starts_on,ends_on,payment_date,status').eq('company_id', id).order('starts_on', { ascending: false }),
            supabase.from('payroll_config_sets').select('id,name,version,status,effective_from').eq('company_id', id).order('version', { ascending: false }),
        ]);
        setEmployees(employeeResult.data || []);
        setBranches(branchResult.data || []);
        setPeriods(periodResult.data || []);
        setConfigs(configResult.data || []);
    }, [user?.id]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const updateEmployee = (key: string, value: string) => setEmployeeForm((current) => ({ ...current, [key]: value }));
    const updatePeriod = (key: string, value: string) => setPeriodForm((current) => ({ ...current, [key]: value }));
    const updateRules = (key: string, value: string) => setRulesForm((current) => ({ ...current, [key]: value }));
    const run = async (action: () => Promise<{ error: any }>, success: string) => {
        setSaving(true);
        try {
            const result = await action();
            if (result.error) throw result.error;
            Alert.alert(t('success', language), success);
            await load();
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
        } finally { setSaving(false); }
    };

    const enablePayroll = () => {
        if (!companyId || !accessReason.trim()) return Alert.alert(t('error', language), 'Enter a reason for this sensitive change.');
        return run(() => Promise.resolve(supabase.rpc('set_payroll_feature_flags', { p_company_id: companyId, p_enabled: true, p_reason: accessReason.trim() })), 'Payroll setup is enabled for authorized roles.');
    };

    const saveEmployee = () => {
        if (!selectedEmployee || !employeeForm.number || !employeeForm.branch || !employeeForm.amount || !employeeForm.effectiveFrom || !employeeForm.reason) return Alert.alert(t('error', language), 'Complete the required employee payroll fields.');
        return run(() => Promise.resolve(supabase.rpc('save_employee_payroll_profile', {
            p_employee_id: selectedEmployee.id, p_employee_number: employeeForm.number, p_branch_id: employeeForm.branch, p_cost_centre_id: null, p_project_id: null,
            p_salary_basis: employeeForm.basis, p_contracted_amount: Number(employeeForm.amount), p_standard_hours: employeeForm.hours ? Number(employeeForm.hours) : null, p_standard_days: employeeForm.days ? Number(employeeForm.days) : null,
            p_effective_from: employeeForm.effectiveFrom, p_tax_status: employeeForm.taxStatus, p_pension_status: employeeForm.pensionStatus, p_iban: employeeForm.iban, p_bank_name: employeeForm.bank, p_reason: employeeForm.reason,
        })), 'Employee payroll details saved.');
    };

    const createPeriod = () => {
        if (!companyId || Object.values(periodForm).some((value) => !value.trim())) return Alert.alert(t('error', language), 'Complete all payroll period fields.');
        return run(() => Promise.resolve(supabase.rpc('create_payroll_period', { p_company_id: companyId, p_code: periodForm.code, p_name: periodForm.name, p_starts_on: periodForm.starts, p_ends_on: periodForm.ends, p_payment_date: periodForm.payment, p_payroll_group_id: null })), 'Payroll period created.');
    };

    const saveRules = () => {
        let brackets: unknown;
        try { brackets = JSON.parse(rulesForm.brackets); } catch { return Alert.alert(t('error', language), 'Tax brackets must be valid JSON.'); }
        if (!companyId || !rulesForm.name || !rulesForm.from || !rulesForm.source || !rulesForm.employeePension || !rulesForm.employerPension || !rulesForm.reason) return Alert.alert(t('error', language), 'Complete the required payroll rule fields.');
        return run(() => Promise.resolve(supabase.rpc('save_payroll_configuration', { p_company_id: companyId, p_name: rulesForm.name, p_effective_from: rulesForm.from, p_effective_until: rulesForm.until || null, p_rule_source_reference: rulesForm.source, p_rounding_mode: rulesForm.rounding, p_money_scale: 2, p_tax_brackets: brackets, p_pension_rule: { employeeRatePercent: rulesForm.employeePension, employerRatePercent: rulesForm.employerPension }, p_reason: rulesForm.reason })), 'Payroll rule version saved as a draft.');
    };

    const selectEmployee = (employee: Row) => {
        setSelectedEmployee(employee);
        setEmployeeForm((current) => ({ ...current, number: employee.employee_number || '', branch: employee.branch_id || '' }));
    };
    const section = (key: Panel, title: string, Icon: any) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: panel === key }} onPress={() => setPanel(panel === key ? 'access' : key)} style={[styles.sectionHeader, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.sectionTitle}><Icon color={brand.colors.primary} size={19}/><Text style={[styles.title, { color: palette.text }]}>{title}</Text></View><ChevronRight color={palette.muted} size={19} style={{ transform: [{ rotate: panel === key ? '90deg' : '0deg' }] }}/></TouchableOpacity>;
    const input = (label: string, key: string, value: string, setter: (key: string, value: string) => void, props: any = {}) => <Input label={label} value={value} onChangeText={(next) => setter(key, next)} {...props}/>;

    return <MobileScreen><MobileHeader title="Payroll setup" subtitle="Authorized sensitive controls" onBack={() => navigation.goBack()}/><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
        <View style={[styles.notice, { backgroundColor: palette.surface, borderColor: palette.border }]}><ShieldCheck color={brand.colors.primary} size={18}/><Text style={[styles.noticeText, { color: palette.muted }]}>All actions are permission-checked, audited and subject to approved payroll configuration.</Text></View>
        {section('access', 'Enable payroll access', ShieldCheck)}{panel === 'access' ? <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>{input('Reason for enabling payroll', 'reason', accessReason, (_key, value) => setAccessReason(value), { placeholder: 'Approved payroll setup reason' })}<Action label="Enable controlled payroll" onPress={enablePayroll} saving={saving}/></View> : null}
        {section('employee', 'Employee pay and bank details', Users)}{panel === 'employee' ? <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>{employees.map((employee) => <TouchableOpacity key={employee.id} onPress={() => selectEmployee(employee)} style={[styles.employee, { borderColor: selectedEmployee?.id === employee.id ? brand.colors.primary : palette.border }]}><Text style={[styles.employeeName, { color: palette.text }]}>{employee.first_name} {employee.last_name}</Text><Text style={{ color: palette.muted, fontSize: 11 }}>{employee.payroll_ready_status || 'requires_review'}</Text></TouchableOpacity>)}{selectedEmployee ? <View style={styles.form}>{input('Employee number', 'number', employeeForm.number, updateEmployee)}<Text style={[styles.fieldLabel, { color: palette.muted }]}>Branch</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{branches.map((branch) => <TouchableOpacity key={branch.id} onPress={() => updateEmployee('branch', branch.id)} style={[styles.chip, { borderColor: palette.border, backgroundColor: employeeForm.branch === branch.id ? brand.colors.primary : palette.background }]}><Text style={{ color: employeeForm.branch === branch.id ? '#fff' : palette.text }}>{branch.name}</Text></TouchableOpacity>)}</ScrollView>{input('Salary basis', 'basis', employeeForm.basis, updateEmployee)}{input('Contracted EUR amount', 'amount', employeeForm.amount, updateEmployee, { keyboardType: 'decimal-pad' })}{input('Effective from', 'effectiveFrom', employeeForm.effectiveFrom, updateEmployee)}{input('Tax status', 'taxStatus', employeeForm.taxStatus, updateEmployee)}{input('Pension status', 'pensionStatus', employeeForm.pensionStatus, updateEmployee)}{input('IBAN', 'iban', employeeForm.iban, updateEmployee)}{input('Bank name', 'bank', employeeForm.bank, updateEmployee)}{input('Reason for change', 'reason', employeeForm.reason, updateEmployee)}<Action label="Save employee payroll profile" onPress={saveEmployee} saving={saving}/></View> : <Text style={{ color: palette.muted }}>Select an employee to configure payroll details.</Text>}</View> : null}
        {section('period', 'Payroll periods', CalendarDays)}{panel === 'period' ? <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>{input('Code', 'code', periodForm.code, updatePeriod, { placeholder: '2026-08' })}{input('Name', 'name', periodForm.name, updatePeriod, { placeholder: 'August 2026' })}{input('Start date', 'starts', periodForm.starts, updatePeriod)}{input('End date', 'ends', periodForm.ends, updatePeriod)}{input('Payment date', 'payment', periodForm.payment, updatePeriod)}<Action label="Create payroll period" onPress={createPeriod} saving={saving}/>{periods.slice(0, 6).map((period) => <Text key={period.id} style={[styles.listRow, { color: palette.muted }]}>{period.name} · {period.status}</Text>)}</View> : null}
        {section('rules', 'Versioned payroll rules', ShieldCheck)}{panel === 'rules' ? <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>{input('Configuration name', 'name', rulesForm.name, updateRules)}{input('Effective from', 'from', rulesForm.from, updateRules)}{input('Effective until', 'until', rulesForm.until, updateRules)}{input('Legal/source reference', 'source', rulesForm.source, updateRules)}{input('Tax brackets JSON', 'brackets', rulesForm.brackets, updateRules, { multiline: true, numberOfLines: 5, style: { minHeight: 110, textAlignVertical: 'top', fontSize: 12 } })}{input('Employee pension %', 'employeePension', rulesForm.employeePension, updateRules, { keyboardType: 'decimal-pad' })}{input('Employer pension %', 'employerPension', rulesForm.employerPension, updateRules, { keyboardType: 'decimal-pad' })}{input('Reason for rule change', 'reason', rulesForm.reason, updateRules)}<Action label="Save payroll rule draft" onPress={saveRules} saving={saving}/>{configs.slice(0, 5).map((config) => <Text key={config.id} style={[styles.listRow, { color: palette.muted }]}>v{config.version} · {config.name} · {config.status}</Text>)}</View> : null}
        <View style={{ height: 100 }}/>
    </ScrollView></MobileScreen>;
}

function Action({ label, onPress, saving }: { label: string; onPress: () => void | Promise<unknown>; saving: boolean }) {
    return <TouchableOpacity disabled={saving} onPress={() => void onPress()} style={[styles.action, saving && { opacity: 0.6 }]}><Text style={styles.actionText}>{saving ? 'Saving…' : label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingBottom: 100 },
    notice: { borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: 'row', gap: 10, marginBottom: 16 },
    noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
    sectionHeader: { minHeight: 58, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 15, fontWeight: '700' },
    panel: { borderWidth: 1, borderRadius: 15, padding: 15, marginBottom: 12 },
    action: { minHeight: 48, borderRadius: 13, backgroundColor: brand.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 4, marginBottom: 8 },
    actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    employee: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
    employeeName: { fontWeight: '700', fontSize: 14 },
    form: { marginTop: 8 },
    fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 7 },
    chips: { gap: 8, paddingBottom: 15 },
    chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 13 },
    listRow: { fontSize: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#e4e9f0' },
});
