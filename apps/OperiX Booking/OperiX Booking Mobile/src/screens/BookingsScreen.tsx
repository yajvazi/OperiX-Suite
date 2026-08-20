import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OperixButton, OperixTabNavigation } from '@invoice-monorepo/ui';
import { useBookingMobile } from '../context/BookingMobileContext';
import { BookingCard, EmptyState, Header, Screen, SearchField } from '../components/booking-ui';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import type { BookingStatus } from '@invoice-monorepo/booking';

const filters: Array<{ label: string; value: BookingStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Upcoming', value: 'confirmed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
];

export function BookingsScreen() {
  const { bookings, loading, refresh } = useBookingMobile();
  const tabNavigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all');
  const visibleBookings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      const matchesFilter = filter === 'all' || booking.status === filter || (filter === 'confirmed' && new Date(booking.starts_at) >= new Date());
      const searchable = [booking.booking_number, booking.customer?.name, booking.guest_name, booking.service?.name].filter(Boolean).join(' ').toLowerCase();
      return matchesFilter && (!normalized || searchable.includes(normalized));
    }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [bookings, filter, query]);

  return (
    <Screen refreshing={loading} onRefresh={() => void refresh()}>
      <Header title="Bookings" subtitle="Keep every reservation moving." action="New" onAction={() => tabNavigation.navigate('NewBooking')} />
      <SearchField value={query} onChangeText={setQuery} />
      <OperixTabNavigation tabs={filters.map((item) => ({ key: item.value, label: item.label }))} activeKey={filter} onChange={(value) => setFilter(value as BookingStatus | 'all')} />
      {visibleBookings.length ? visibleBookings.map((booking) => <BookingCard key={booking.id} booking={booking} onPress={() => rootNavigation.navigate('BookingDetail', { bookingId: booking.id })} />) : <EmptyState title={query ? 'No matches found' : 'No bookings yet'} description={query ? 'Try a booking number, customer, or service.' : 'Create your first reservation and your schedule will appear here.'} action="Create booking" onAction={() => tabNavigation.navigate('NewBooking')} />}
      {!loading ? <OperixButton title="Refresh bookings" onPress={() => void refresh()} variant="ghost" size="small" fullWidth={false} /> : null}
    </Screen>
  );
}
