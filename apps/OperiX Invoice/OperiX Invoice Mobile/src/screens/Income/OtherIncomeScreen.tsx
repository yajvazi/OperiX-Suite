import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Plus, TrendingUp } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '@invoice-monorepo/api';
import { listOtherIncome } from '@invoice-monorepo/api/repositories';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { getPalette, brand } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { activeLocalStore } from '../../services/localMode';
import type { RootStackParamList } from '../../navigation/types';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

export function OtherIncomeScreen() {
  const { user } = useAuth();
  const { isDark, language } = useTheme();
  const palette = getPalette(isDark);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    const localStore = await activeLocalStore();
    if (localStore) { setRows(await localStore.list('other_income', { orderBy: '-income_date' }) as Record<string, unknown>[]); return; }
    const scope = await getWorkspaceScope(user.id);
    setRows(await listOtherIncome(supabase, { userId: user.id, companyIds: scope.companyIds }));
  }, [user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <MobileScreen>
    <MobileHeader title={t('otherIncome', language)} subtitle={t('otherIncomeDescription', language)} />
    <ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} contentContainerStyle={styles.content}>
      <TouchableOpacity style={[styles.add, { backgroundColor: brand.colors.primary }]} onPress={() => navigation.navigate('OtherIncomeForm')}>
        <Plus color="#fff" size={18} /><Text style={styles.addText}>{t('addOtherIncome', language)}</Text>
      </TouchableOpacity>
      {rows.map((row) => {
        const category = row.category as Record<string, unknown> | null;
        return <View key={String(row.id)} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}><View style={[styles.icon, { backgroundColor: `${brand.colors.success}18` }]}><TrendingUp color={brand.colors.success} size={18} /></View><View style={styles.info}><Text style={[styles.title, { color: palette.text }]}>{String(row.description || row.income_number)}</Text><Text style={[styles.muted, { color: palette.muted }]}>{String(category?.name_sq || category?.name_en || row.income_number)} · {String(row.income_date)}</Text></View><Text style={[styles.amount, { color: brand.colors.success }]}>{formatCurrency(Number(row.gross_amount || 0), String(row.currency || 'EUR'), language)}</Text></View>
          {row.tax_treatment === 'review_required' ? <Text style={[styles.review, { color: brand.colors.warning }]}>{t('reviewRequired', language)}</Text> : null}
        </View>;
      })}
      {!rows.length ? <Text style={[styles.empty, { color: palette.muted }]}>{t('noItemsYet', language)}</Text> : null}
    </ScrollView>
  </MobileScreen>;
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 12 }, add: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, addText: { color: '#fff', fontFamily: brand.fonts.semibold, fontSize: 14 }, card: { borderWidth: 1, borderRadius: 16, padding: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, info: { flex: 1 }, title: { fontFamily: brand.fonts.semibold, fontSize: 14 }, muted: { marginTop: 4, fontSize: 11 }, amount: { fontFamily: brand.fonts.semibold, fontSize: 14 }, review: { marginTop: 10, fontSize: 11, fontFamily: brand.fonts.medium }, empty: { textAlign: 'center', marginTop: 30, fontSize: 13 } });
