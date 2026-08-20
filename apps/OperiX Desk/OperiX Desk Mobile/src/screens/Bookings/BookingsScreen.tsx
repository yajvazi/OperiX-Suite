import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Armchair, CalendarDays, CheckCircle2, ChevronRight, CircleX, Clock3 } from 'lucide-react-native';
import type { DeskReservation } from '@invoice-monorepo/desk-types';
import { useTheme } from '@invoice-monorepo/hooks';
import { OperixAlert, OperixLoadingState, OperixScrollableScreen, OperixScreen } from '@invoice-monorepo/ui';
import { deskApi } from '../../services/deskApi';
import { brand } from '../../theme/brand';
import { t } from '../../lib/i18n';

function dateKey(value = new Date()) { return value.toISOString().slice(0, 10); }
function formatDate(value: string, language: string) { return new Intl.DateTimeFormat(language === 'sq' ? 'sq-AL' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }

export function BookingsScreen({ route }: { route?: { params?: { reservationId?: number } } }) {
  const { language } = useTheme();
  const navigation = useNavigation<any>();
  const focusedReservationId = route?.params?.reservationId;
  const [reservations, setReservations] = useState<DeskReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { setReservations(await deskApi.getMyReservations()); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : t('failed', language)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [language]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const today = dateKey();
  const sections = useMemo(() => ({
    today: reservations.filter((item) => item.status === 'active' && item.date === today),
    upcoming: reservations.filter((item) => item.status === 'active' && item.date > today),
    past: reservations.filter((item) => item.status === 'active' && item.date < today).sort((a, b) => b.date.localeCompare(a.date)),
    cancelled: reservations.filter((item) => item.status === 'cancelled').sort((a, b) => b.date.localeCompare(a.date)),
  }), [reservations, today]);

  const cancel = (reservation: DeskReservation) => Alert.alert('Cancel reservation?', `${reservation.resource?.name || 'Workspace resource'} · ${formatDate(reservation.date, language)}`, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Cancel reservation', style: 'destructive', onPress: async () => { setCancelling(reservation.id); setError(''); try { await deskApi.cancelReservation(reservation.id); await load(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'We could not cancel this reservation.'); } finally { setCancelling(null); } } },
  ]);

  if (loading) return <OperixScreen><OperixLoadingState label={t('loading', language)} /></OperixScreen>;

  return <OperixScrollableScreen refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>{t('bookings', language)}</Text><Text style={styles.title}>My reservations</Text><Text style={styles.subtitle}>Your confirmed workplace plans, in one place.</Text></View><View style={styles.icon}><CalendarDays color={brand.primary} size={21} /></View></View>
    {error ? <OperixAlert tone="error" message={error} actionLabel={t('retry', language)} onAction={() => void load()} /> : null}
    <Section title="Today" icon={<CheckCircle2 color={brand.primary} size={17} />} data={sections.today} language={language} onCancel={cancel} cancelling={cancelling} focusedReservationId={focusedReservationId} onReserve={() => navigation.navigate('Reserve')} empty="No reservation today. Choose a desk for your office day." />
    <Section title="Upcoming" icon={<Clock3 color={brand.primary} size={17} />} data={sections.upcoming} language={language} onCancel={cancel} cancelling={cancelling} focusedReservationId={focusedReservationId} onReserve={() => navigation.navigate('Reserve')} empty="No upcoming reservations yet." />
    <Section title="Past" icon={<CalendarDays color={brand.primary} size={17} />} data={sections.past} language={language} onCancel={cancel} cancelling={cancelling} focusedReservationId={focusedReservationId} empty="Your past reservations will appear here." />
    <Section title="Cancelled" icon={<CircleX color="#B42318" size={17} />} data={sections.cancelled} language={language} onCancel={cancel} cancelling={cancelling} focusedReservationId={focusedReservationId} empty="No cancelled reservations." cancelled />
  </OperixScrollableScreen>;
}

function Section({ title, icon, data, language, onCancel, cancelling, focusedReservationId, onReserve, empty, cancelled = false }: { title: string; icon: React.ReactNode; data: DeskReservation[]; language: string; onCancel: (reservation: DeskReservation) => void; cancelling: number | null; focusedReservationId?: number; onReserve?: () => void; empty: string; cancelled?: boolean }) {
  return <View style={styles.section}><View style={styles.sectionHeader}><View style={styles.sectionTitleWrap}>{icon}<Text style={styles.sectionTitle}>{title}</Text><View style={styles.count}><Text style={styles.countText}>{data.length}</Text></View></View>{onReserve && title === 'Today' ? <TouchableOpacity onPress={onReserve}><Text style={styles.link}>{t('reserveDesk', language)}</Text></TouchableOpacity> : null}</View>{data.length ? data.map((reservation) => <ReservationCard key={reservation.id} reservation={reservation} language={language} onCancel={onCancel} cancelling={cancelling} cancelled={cancelled} focused={reservation.id === focusedReservationId} />) : <View style={styles.empty}><Text style={styles.emptyText}>{empty}</Text>{onReserve && title === 'Today' ? <TouchableOpacity onPress={onReserve} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{t('reserveDesk', language)}</Text><ChevronRight color="#fff" size={15} /></TouchableOpacity> : null}</View>}</View>;
}

function ReservationCard({ reservation, language, onCancel, cancelling, cancelled, focused }: { reservation: DeskReservation; language: string; onCancel: (reservation: DeskReservation) => void; cancelling: number | null; cancelled: boolean; focused: boolean }) {
  const resource = reservation.resource;
  const isBusy = cancelling === reservation.id;
  return <View style={[styles.card, cancelled && styles.cancelledCard]}><View style={styles.cardTop}><View style={styles.resourceIcon}><Armchair color={cancelled ? '#98A2B3' : brand.primary} size={19} /></View><View style={styles.cardCopy}><Text style={[styles.resourceName, cancelled && styles.mutedText]}>{resource?.name || 'Workspace resource'}</Text><Text style={styles.meta}>{formatDate(reservation.date, language)} · Floor {resource?.floor || '—'}</Text><Text style={styles.meta}>{resource?.building || 'Office'} · {resource?.zone || 'Workspace'}</Text></View><View style={[styles.badge, cancelled ? styles.badgeCancelled : styles.badgeConfirmed]}><Text style={[styles.badgeText, cancelled && styles.badgeCancelledText]}>{cancelled ? 'Cancelled' : 'Confirmed'}</Text></View></View><View style={styles.cardBottom}><Text style={styles.meta}>{reservation.start_time && reservation.end_time ? `${reservation.start_time.slice(0, 5)} – ${reservation.end_time.slice(0, 5)}` : 'All day'}</Text>{reservation.status === 'active' && reservation.date >= dateKey() ? <TouchableOpacity disabled={isBusy} onPress={() => onCancel(reservation)} style={styles.cancelButton}>{isBusy ? <ActivityIndicator color="#B42318" size="small" /> : <><Text style={styles.cancelText}>Cancel</Text><CircleX color="#B42318" size={14} /></>}</TouchableOpacity> : null}</View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.background }, content: { paddingBottom: 35 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.background }, header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }, eyebrow: { color: brand.primary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }, title: { marginTop: 5, color: brand.text, fontSize: 28, fontWeight: '800' }, subtitle: { marginTop: 6, color: brand.muted, fontSize: 13, lineHeight: 19 }, icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#EDF3FF' }, section: { marginBottom: 19 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 }, sectionTitle: { color: brand.text, fontSize: 17, fontWeight: '800' }, count: { minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#EDF3FF' }, countText: { color: brand.primary, fontSize: 10, fontWeight: '800' }, link: { color: brand.primary, fontSize: 12, fontWeight: '800' }, card: { marginBottom: 9, padding: 14, borderRadius: 17, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, cancelledCard: { opacity: 0.72 }, cardTop: { flexDirection: 'row', alignItems: 'flex-start' }, resourceIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EDF3FF' }, cardCopy: { flex: 1, marginLeft: 10 }, resourceName: { color: brand.text, fontSize: 14, fontWeight: '800' }, meta: { color: brand.muted, fontSize: 11, marginTop: 4 }, badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 }, badgeConfirmed: { backgroundColor: '#E9F9F0' }, badgeCancelled: { backgroundColor: '#FFF0EF' }, badgeText: { color: '#067647', fontSize: 9, fontWeight: '800' }, badgeCancelledText: { color: '#B42318' }, cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9' }, cancelButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: '#FFF0EF' }, cancelText: { color: '#B42318', fontSize: 10, fontWeight: '800' }, mutedText: { color: brand.muted }, empty: { alignItems: 'flex-start', padding: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, backgroundColor: brand.surface }, emptyText: { color: brand.muted, fontSize: 12, lineHeight: 18 }, primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, backgroundColor: brand.primary }, primaryButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' }, errorBox: { padding: 13, borderRadius: 14, backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#FECACA', marginBottom: 14 }, errorText: { color: '#B42318', fontSize: 12 }, retry: { marginTop: 6, color: brand.primary, fontSize: 12, fontWeight: '800' },
});
