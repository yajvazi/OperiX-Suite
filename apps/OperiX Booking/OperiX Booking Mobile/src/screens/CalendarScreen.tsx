import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '@invoice-monorepo/hooks';
import { OperixButton, OperixIconButton, OperixTabNavigation } from '@invoice-monorepo/ui';
import { useBookingMobile } from '../context/BookingMobileContext';
import { BookingCard, EmptyState, Header, Screen, formatBookingDate } from '../components/booking-ui';
import { brand } from '../theme/brand';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function CalendarScreen() {
  const { isDark } = useTheme();
  const { bookings } = useBookingMobile();
  const tabNavigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedKey = dateKey(selectedDate);
  const dayBookings = useMemo(() => bookings.filter((booking) => dateKey(new Date(booking.starts_at)) === selectedKey).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [bookings, selectedKey]);

  function shiftDay(amount: number) {
    setSelectedDate((current) => new Date(current.getTime() + amount * 86_400_000));
  }

  return (
    <Screen>
      <Header title="Calendar" subtitle="A focused view of the team schedule." action="New" onAction={() => tabNavigation.navigate('NewBooking')} />
      <View style={[styles.dateCard, { backgroundColor: isDark ? '#10233F' : brand.surface, borderColor: isDark ? '#203755' : brand.border }]}>
        <OperixIconButton label="Previous day" onPress={() => shiftDay(-1)} size={38}><ChevronLeft color={brand.primary} size={20} /></OperixIconButton>
        <View style={styles.dateCenter}><Text style={[styles.dayLabel, { color: isDark ? '#fff' : brand.text }]}>{formatBookingDate(selectedDate.toISOString(), true)}</Text><Text style={[styles.dayHint, { color: isDark ? '#AEBBD0' : brand.muted }]}>{dayBookings.length} reservation{dayBookings.length === 1 ? '' : 's'}</Text></View>
        <OperixIconButton label="Next day" onPress={() => shiftDay(1)} size={38}><ChevronRight color={brand.primary} size={20} /></OperixIconButton>
      </View>
      <View style={styles.viewRow}><OperixTabNavigation tabs={[{ key: 'day', label: 'Day' }, { key: 'agenda', label: 'Agenda' }]} activeKey="day" onChange={() => undefined} style={styles.viewTabs} /><OperixButton title="Today" onPress={() => setSelectedDate(new Date())} variant="outline" size="small" fullWidth={false} /></View>
      {dayBookings.length ? dayBookings.map((booking) => <BookingCard key={booking.id} booking={booking} onPress={() => rootNavigation.navigate('BookingDetail', { bookingId: booking.id })} />) : <EmptyState title="No reservations on this day" description="Choose another date or create a new booking for this schedule." action="Create booking" onAction={() => tabNavigation.navigate('NewBooking')} />}
      <OperixButton title="New booking" onPress={() => tabNavigation.navigate('NewBooking')} fullWidth />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateCard: { borderWidth: 1, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateCenter: { alignItems: 'center' },
  dayLabel: { fontSize: 16, fontWeight: '900' },
  dayHint: { fontSize: 12, marginTop: 4 },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16 },
  viewTabs: { flex: 1 },
});
