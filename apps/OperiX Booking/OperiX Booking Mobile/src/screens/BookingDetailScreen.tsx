import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, CheckCircle2, Clock3, MapPin, UserRound } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { transitionBooking } from '@invoice-monorepo/booking/api';
import type { BookingStatus } from '@invoice-monorepo/booking';
import { supabase } from '@invoice-monorepo/api';
import { useTheme } from '@invoice-monorepo/hooks';
import { OperixButton, OperixConfirmDialog, OperixDetailScreen } from '@invoice-monorepo/ui';
import { useBookingMobile } from '../context/BookingMobileContext';
import { brand } from '../theme/brand';
import type { RootStackParamList } from '../navigation/types';
import { Card, StatusPill, displayBookingName, formatBookingDate, formatBookingTime, formatCurrency } from '../components/booking-ui';

type Props = NativeStackScreenProps<RootStackParamList, 'BookingDetail'>;

const actionMap: Partial<Record<BookingStatus, Array<{ label: string; next: BookingStatus; tone?: 'danger' | 'primary' }>>> = {
  pending: [{ label: 'Confirm booking', next: 'confirmed' }],
  confirmed: [{ label: 'Check in customer', next: 'checked_in' }, { label: 'Cancel booking', next: 'cancelled', tone: 'danger' }],
  checked_in: [{ label: 'Start service', next: 'in_progress' }, { label: 'Cancel booking', next: 'cancelled', tone: 'danger' }],
  in_progress: [{ label: 'Complete booking', next: 'completed' }],
};

export function BookingDetailScreen() {
  const route = useRoute<Props['route']>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDark } = useTheme();
  const { bookings, companyId, refresh } = useBookingMobile();
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const booking = useMemo(() => bookings.find((item) => item.id === route.params.bookingId), [bookings, route.params.bookingId]);
  const actions = booking ? actionMap[booking.status] || [] : [];
  const text = isDark ? '#fff' : brand.text;
  const muted = isDark ? '#AEBBD0' : brand.muted;

  async function runTransition(next: BookingStatus) {
    if (!booking || !companyId) return;
    const destructive = next === 'cancelled';
    setSaving(true);
    try {
      await transitionBooking(supabase, companyId, booking.id, next, destructive ? 'Mobile action' : undefined);
      await refresh();
    } catch (error) {
      Alert.alert('Could not update booking', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function updateStatus(next: BookingStatus) {
    if (next === 'cancelled') setConfirmCancel(true);
    else void runTransition(next);
  }

  if (!booking) return <OperixDetailScreen title="Booking not found" onBack={() => navigation.goBack()}><Card><Text style={[styles.missing, { color: text }]}>Booking not found</Text></Card></OperixDetailScreen>;

  return (
    <>
    <OperixDetailScreen title={displayBookingName(booking)} subtitle={`${booking.booking_number} · ${booking.customer?.name || booking.guest_name || 'Guest customer'}`} onBack={() => navigation.goBack()} status={<StatusPill status={booking.status} />} action={actions.length ? <View style={styles.actions}>{actions.map((action) => <OperixButton key={action.next} title={saving ? 'Updating…' : action.label} onPress={() => updateStatus(action.next)} variant={action.tone === 'danger' ? 'danger' : 'primary'} loading={saving} disabled={saving} icon={action.next === 'completed' ? CheckCircle2 : undefined} />)}</View> : undefined}>
      <Card><DetailRow icon={<CalendarDays color={brand.primary} size={17} />} label="Date" value={formatBookingDate(booking.starts_at, true)} /><DetailRow icon={<Clock3 color={brand.primary} size={17} />} label="Time" value={formatBookingTime(booking.starts_at) + ' – ' + formatBookingTime(booking.ends_at)} /><DetailRow icon={<UserRound color={brand.primary} size={17} />} label="Customer" value={booking.customer?.name || booking.guest_name || 'Guest customer'} />{booking.location?.name ? <DetailRow icon={<MapPin color={brand.primary} size={17} />} label="Location" value={booking.location.name} /> : null}</Card>
      <Card><Text style={[styles.cardTitle, { color: text }]}>Payment summary</Text><View style={styles.amountRow}><Text style={{ color: muted }}>Total</Text><Text style={[styles.amount, { color: text }]}>{formatCurrency(Number(booking.total_amount || booking.price), booking.currency)}</Text></View><View style={styles.amountRow}><Text style={{ color: muted }}>Paid</Text><Text style={{ color: booking.paid_amount ? brand.success : muted, fontWeight: '800' }}>{formatCurrency(Number(booking.paid_amount || 0), booking.currency)}</Text></View><View style={styles.amountRow}><Text style={{ color: muted }}>Status</Text><Text style={{ color: text, fontWeight: '800' }}>{booking.payment_status.replace(/_/g, ' ')}</Text></View></Card>
    </OperixDetailScreen>
    <OperixConfirmDialog visible={confirmCancel} onCancel={() => setConfirmCancel(false)} onConfirm={() => { setConfirmCancel(false); void runTransition('cancelled'); }} title="Cancel booking?" message="This cancellation will remain in the booking history." confirmLabel="Cancel booking" cancelLabel="Keep booking" destructive loading={saving} />
    </>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const { isDark } = useTheme();
  return <View style={styles.detailRow}><View style={styles.detailIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={[styles.detailLabel, { color: isDark ? '#AEBBD0' : brand.muted }]}>{label}</Text><Text style={[styles.detailValue, { color: isDark ? '#fff' : brand.text }]}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  missing: { fontSize: 16, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  detailIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: 11, fontWeight: '700' },
  detailValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, fontSize: 13 },
  amount: { fontSize: 16, fontWeight: '900' },
  actions: { width: '100%', gap: 9 },
});
