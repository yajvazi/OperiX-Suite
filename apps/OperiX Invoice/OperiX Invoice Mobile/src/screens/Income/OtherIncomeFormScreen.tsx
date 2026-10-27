import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '@invoice-monorepo/api';
import { listFinancialAccountBalances, listOtherIncomeCategories, saveOtherIncome } from '@invoice-monorepo/api/repositories';
import { Button, Card, Input } from '@invoice-monorepo/ui';
import { t } from '@invoice-monorepo/i18n';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { getPalette, brand } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

const today = () => new Date().toISOString().slice(0, 10);
async function idempotencyKey() {
  const nativeUuid = Crypto.randomUUID?.();
  if (nativeUuid) return nativeUuid;
  const bytes = await Crypto.getRandomBytesAsync(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function OtherIncomeFormScreen() {
  const { user } = useAuth();
  const { isDark, language } = useTheme();
  const palette = getPalette(isDark);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [categories, setCategories] = useState<Record<string, unknown>[]>([]);
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [form, setForm] = useState({ date: today(), payer: '', description: '', net: '', vat: '', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  useEffect(() => { if (!user) return; void (async () => { const scope = await getWorkspaceScope(user.id); const apiScope = { userId: user.id, companyIds: scope.companyIds }; const [categoryRows, accountRows] = await Promise.all([listOtherIncomeCategories(supabase, scope.companyId), listFinancialAccountBalances(supabase, apiScope)]); setCategories(categoryRows); setAccounts(accountRows); setCategoryId(String(categoryRows[0]?.id || '')); setAccountId(String(accountRows[0]?.id || '')); })(); }, [user]);
  const save = async () => {
    if (saveInFlight.current || !user) return;
    if (!categoryId || !accountId || !form.description.trim() || Number(form.net) <= 0) { Alert.alert(t('error', language), t('fillAllFields', language)); return; }
    saveInFlight.current = true; setSaving(true);
    try { const scope = await getWorkspaceScope(user.id); if (!scope.companyId) throw new Error(t('selectCompany', language)); await saveOtherIncome(supabase, { companyId: scope.companyId, categoryId, incomeDate: form.date, payerSource: form.payer, description: form.description, netAmount: form.net, vatAmount: form.vat || '0', taxTreatment: 'review_required', paymentMethod: 'bank', fundAccountId: accountId, reference: form.reference, notes: form.notes, idempotencyKey: await idempotencyKey() }); Alert.alert(t('success', language), t('otherIncomeSaved', language), [{ text: t('done', language), onPress: () => navigation.goBack() }]); } catch (error) { Alert.alert(t('error', language), error instanceof Error ? error.message : t('otherIncomeSaveError', language)); } finally { saveInFlight.current = false; setSaving(false); }
  };
  return <MobileScreen><MobileHeader title={t('addOtherIncome', language)} subtitle={t('otherIncomeDescription', language)} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Card><Input label={t('category', language)} value={String(categories.find((row) => String(row.id) === categoryId)?.name_sq || categories.find((row) => String(row.id) === categoryId)?.name_en || '')} editable={false} onChangeText={() => undefined} /><ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.map((row) => <TouchableOpacity key={String(row.id)} onPress={() => setCategoryId(String(row.id))} style={[styles.chip, { borderColor: String(row.id) === categoryId ? brand.colors.primary : palette.border, backgroundColor: String(row.id) === categoryId ? `${brand.colors.primary}12` : palette.surface }]}><Text style={{ color: palette.text, fontSize: 12 }}>{String(language === 'sq' ? row.name_sq : row.name_en)}</Text></TouchableOpacity>)}</ScrollView>
      <Input label={t('payerSource', language)} value={form.payer} onChangeText={(value) => setForm((current) => ({ ...current, payer: value }))} /><Input label={t('description', language)} required value={form.description} onChangeText={(value) => setForm((current) => ({ ...current, description: value }))} /><Input label={t('amount', language)} required keyboardType="decimal-pad" value={form.net} onChangeText={(value) => setForm((current) => ({ ...current, net: value }))} /><Input label={t('vatAmount', language)} keyboardType="decimal-pad" value={form.vat} onChangeText={(value) => setForm((current) => ({ ...current, vat: value }))} helperText={t('reviewRequired', language)} /><Input label={t('date', language)} value={form.date} onChangeText={(value) => setForm((current) => ({ ...current, date: value }))} /><Input label={t('reference', language)} value={form.reference} onChangeText={(value) => setForm((current) => ({ ...current, reference: value }))} />
      <Text style={[styles.label, { color: palette.muted }]}>{t('destinationAccount', language)}</Text><View style={styles.accountList}>{accounts.map((row) => <TouchableOpacity key={String(row.id)} onPress={() => setAccountId(String(row.id))} style={[styles.account, { borderColor: String(row.id) === accountId ? brand.colors.primary : palette.border }]}><Text style={{ color: palette.text, fontFamily: brand.fonts.medium }}>{String(row.name)}</Text><Text style={{ color: palette.muted, fontSize: 11 }}>{String(row.currency)} · {String(row.account_type || row.fund_type)}</Text></TouchableOpacity>)}</View>
      <Input label={t('notes', language)} value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} multiline /><Button title={saving ? t('loading', language) : t('saveOtherIncome', language)} onPress={() => void save()} disabled={saving} style={{ marginTop: 10 }} />
  </Card>
  </ScrollView></MobileScreen>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 40 }, chips: { gap: 8, paddingVertical: 8 }, chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }, label: { fontSize: 12, marginTop: 10, marginBottom: 8 }, accountList: { gap: 8 }, account: { borderWidth: 1, borderRadius: 12, padding: 12 }, });
