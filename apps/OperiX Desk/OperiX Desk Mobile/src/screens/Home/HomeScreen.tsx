import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowRight, Armchair, Bell, Building2, CalendarDays, ChevronRight, LocateFixed, Map, MapPin, Users } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import type { DeskReservation, DeskUser, EmployeeSummary, DeskColleagueLocation } from '@invoice-monorepo/desk-types';
import { supabase } from '@invoice-monorepo/api';
import { OperixAlert, OperixLoadingState, OperixScrollableScreen, OperixScreen } from '@invoice-monorepo/ui';
import { deskApi } from '../../services/deskApi';
import { brand } from '../../theme/brand';
import { t } from '../../lib/i18n';

function dateKey(value = new Date()) { return value.toISOString().slice(0, 10); }
function dayGreeting(locale: string) { const hour = new Date().getHours(); return t(hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening', locale); }

export function HomeScreen({ route }: { route?: { params?: { team?: string } } }) {
  const { user: authUser } = useAuth();
  const { language } = useTheme();
  const navigation = useNavigation<any>();
  const requestedTeam = route?.params?.team || '';
  const [deskUser, setDeskUser] = useState<DeskUser | null>(null);
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [reservations, setReservations] = useState<DeskReservation[]>([]);
  const [people, setPeople] = useState<DeskColleagueLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setError('');
    try {
      const [userData, summaryData, reservationData, peopleData] = await Promise.all([
        deskApi.getMe(), deskApi.getEmployeeSummary(), deskApi.getMyReservations(), deskApi.getWhoIsInToday(requestedTeam ? { team: requestedTeam } : {}),
      ]);
      setDeskUser(userData); setSummary(summaryData); setReservations(reservationData); setPeople(peopleData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('failed', language));
    } finally { setLoading(false); setRefreshing(false); }
  }, [language, requestedTeam]);

  useFocusEffect(useCallback(() => { void fetchData(); }, [fetchData]));

  React.useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase.channel('operix-desk-mobile-home').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchData).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const todayReservation = useMemo(() => reservations.find((item) => item.status === 'active' && item.date === dateKey()), [reservations]);
  const firstName = deskUser?.full_name?.split(' ')[0] || authUser?.user_metadata?.first_name || 'there';
  const capacity = (summary?.available_desks || 0) + people.length;

  if (loading) return <OperixScreen><OperixLoadingState label={t('loading', language)} /></OperixScreen>;

  return <OperixScrollableScreen refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchData(); }} contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text style={styles.greeting}>{dayGreeting(language)}, {firstName}</Text><Text style={styles.subtitle}>{t('workplaceToday', language)}</Text></View><TouchableOpacity accessibilityLabel="Notifications" style={styles.iconButton}><Bell color={brand.text} size={20} /></TouchableOpacity></View>
    {error ? <OperixAlert tone="error" message={error} actionLabel={t('retry', language)} onAction={() => void fetchData()} /> : null}
    <View style={styles.cardGrid}><Metric label={t('availableDesks', language)} value={summary?.available_desks} icon={<Armchair color={brand.primary} size={19} />} /><Metric label={t('peopleInOffice', language)} value={people.length} icon={<Users color={brand.primary} size={19} />} /><Metric label={t('availableRooms', language)} value={summary?.available_rooms} icon={<Building2 color={brand.primary} size={19} />} /><Metric label={t('officeCapacity', language)} value={capacity || '—'} icon={<CalendarDays color={brand.primary} size={19} />} /></View>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('todayReservation', language)}</Text><TouchableOpacity onPress={() => navigation.navigate('Bookings')}><Text style={styles.link}>{t('bookings', language)}</Text></TouchableOpacity></View>
    {todayReservation ? <View style={styles.reservationCard}><View style={styles.reservationTop}><View><Text style={styles.overline}>{t('confirmed', language)}</Text><Text style={styles.resourceName}>{todayReservation.resource?.name || 'Workspace resource'}</Text><Text style={styles.reservationMeta}>Floor {todayReservation.resource?.floor} · {todayReservation.resource?.building || 'Office'}</Text></View><View style={styles.status}><Text style={styles.statusText}>Confirmed</Text></View></View><View style={styles.reservationBottom}><Text style={styles.reservationMeta}>{todayReservation.resource?.zone || 'Workspace'}</Text><Text style={styles.reservationMeta}>{todayReservation.start_time && todayReservation.end_time ? `${todayReservation.start_time.slice(0, 5)} – ${todayReservation.end_time.slice(0, 5)}` : 'All day'}</Text></View><TouchableOpacity onPress={() => navigation.navigate('Floor')} style={styles.lightButton}><Text style={styles.lightButtonText}>{t('viewFloor', language)}</Text><MapPin color={brand.primary} size={16} /></TouchableOpacity></View> : <View style={styles.emptyCard}><View style={styles.emptyIcon}><Armchair color={brand.primary} size={21} /></View><Text style={styles.emptyTitle}>{t('noReservation', language)}</Text><Text style={styles.muted}>Plan your office day by choosing a desk.</Text><TouchableOpacity onPress={() => navigation.navigate('Reserve')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{t('reserveDesk', language)}</Text><ArrowRight color="#fff" size={16} /></TouchableOpacity></View>}
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('quickActions', language)}</Text></View><View style={styles.actions}><Action icon={<Armchair color={brand.primary} size={19} />} label={t('reserveDesk', language)} onPress={() => navigation.navigate('Reserve')} /><Action icon={<LocateFixed color={brand.primary} size={19} />} label={t('findTeam', language)} onPress={() => navigation.navigate('Reserve')} /><Action icon={<Map color={brand.primary} size={19} />} label={t('floor', language)} onPress={() => navigation.navigate('Floor')} /></View>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('whoIsIn', language)}</Text><TouchableOpacity onPress={() => navigation.navigate('More')}><Text style={styles.link}>View all</Text></TouchableOpacity></View><View style={styles.card}>{people.slice(0, 5).map((person) => <View key={person.id} style={styles.personRow}><View style={styles.avatar}><Text style={styles.avatarText}>{person.full_name.charAt(0)}</Text></View><View style={styles.personCopy}><Text style={styles.personName}>{person.full_name}</Text><Text style={styles.muted}>Floor {person.floor} · {person.desk}</Text></View><ChevronRight color="#98A2B3" size={16} /></View>)}{people.length === 0 ? <Text style={styles.emptyText}>{t('noPeople', language)}</Text> : null}</View>
  </OperixScrollableScreen>;
}

function Metric({ label, value, icon }: { label: string; value: number | string | undefined; icon: React.ReactNode }) { return <View style={styles.metric}><View style={styles.metricIcon}>{icon}</View><Text style={styles.metricValue}>{value ?? '—'}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Action({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={styles.action}><View style={styles.actionIcon}>{icon}</View><Text style={styles.actionLabel}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.background }, content: { paddingBottom: 32 }, header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }, greeting: { color: brand.text, fontSize: 25, fontWeight: '800' }, subtitle: { color: brand.muted, fontSize: 13, marginTop: 6, lineHeight: 19, maxWidth: 285 }, iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { width: '48%', minHeight: 112, borderRadius: 17, padding: 13, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, metricIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#EDF3FF' }, metricValue: { marginTop: 9, color: brand.text, fontSize: 22, fontWeight: '800' }, metricLabel: { marginTop: 2, color: brand.muted, fontSize: 11, fontWeight: '600' }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 11 }, sectionTitle: { color: brand.text, fontSize: 18, fontWeight: '800' }, link: { color: brand.primary, fontSize: 12, fontWeight: '800' }, card: { borderRadius: 18, padding: 15, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, reservationCard: { borderRadius: 19, padding: 17, backgroundColor: brand.primary, shadowColor: brand.primary, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 }, reservationTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, overline: { color: '#D9E6FF', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }, resourceName: { marginTop: 7, color: '#fff', fontSize: 23, fontWeight: '800' }, reservationMeta: { color: '#D9E6FF', fontSize: 12, marginTop: 4 }, status: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', height: 27 }, statusText: { color: '#fff', fontSize: 10, fontWeight: '800' }, reservationBottom: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', marginTop: 18, paddingTop: 13 }, lightButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: '#fff' }, lightButtonText: { color: brand.primary, fontWeight: '800', fontSize: 13 }, emptyCard: { alignItems: 'flex-start', borderRadius: 19, padding: 17, backgroundColor: brand.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border }, emptyIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#EDF3FF' }, emptyTitle: { marginTop: 12, color: brand.text, fontSize: 16, fontWeight: '800' }, muted: { color: brand.muted, fontSize: 12, marginTop: 4 }, primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 15, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: brand.primary }, primaryButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 9 }, action: { flex: 1, alignItems: 'center', padding: 13, borderRadius: 16, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, actionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#EDF3FF' }, actionLabel: { marginTop: 8, textAlign: 'center', color: brand.text, fontSize: 11, fontWeight: '700' }, personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }, avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9E6FF' }, avatarText: { color: brand.primary, fontWeight: '800' }, personCopy: { flex: 1, marginLeft: 10 }, personName: { color: brand.text, fontSize: 13, fontWeight: '800' }, emptyText: { color: brand.muted, fontSize: 13, textAlign: 'center', paddingVertical: 20 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.background }, errorBox: { padding: 13, borderRadius: 14, backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#FECACA', marginBottom: 14 }, errorText: { color: '#B42318', fontSize: 12 }, retry: { color: brand.primary, fontSize: 12, fontWeight: '800', marginTop: 7 },
});
