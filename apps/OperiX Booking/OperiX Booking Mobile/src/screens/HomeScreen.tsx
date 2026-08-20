import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, CalendarPlus, ClipboardCheck, DollarSign, UserPlus } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { OperixAlert, OperixButton, OperixStatCard, operixMobileTokens } from '@invoice-monorepo/ui';
import { useBookingMobile } from '../context/BookingMobileContext';
import { useTheme } from '@invoice-monorepo/hooks';
import { brand } from '../theme/brand';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { BookingCard, EmptyState, Header, SectionTitle, Screen, formatCurrency } from '../components/booking-ui';

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNavigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { isDark } = useTheme();
  const { user, companyName, bookings, loading, error } = useBookingMobile();
  const today = dayKey(new Date());
  const firstName = user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'there';
  const todayBookings = useMemo(() => bookings.filter((booking) => dayKey(new Date(booking.starts_at)) === today && booking.status !== 'cancelled'), [bookings, today]);
  const upcoming = useMemo(() => bookings.filter((booking) => new Date(booking.starts_at) >= new Date() && booking.status !== 'cancelled').sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3), [bookings]);
  const completed = bookings.filter((booking) => booking.status === 'completed').length;
  const revenue = bookings.filter((booking) => booking.payment_status !== 'refunded').reduce((total, booking) => total + Number(booking.paid_amount || 0), 0);

  return (
    <Screen refreshing={loading}>
      <View style={styles.topLine}><View><Text style={[styles.company, { color: isDark ? '#AEBBD0' : brand.muted }]}>{companyName}</Text><Text style={[styles.greeting, { color: isDark ? '#fff' : brand.text }]}>Welcome back, {firstName}</Text></View><Pressable accessibilityLabel="Notifications" style={styles.bell}><Bell color={brand.primary} size={20} /></Pressable></View>
      <Text style={[styles.intro, { color: isDark ? '#AEBBD0' : brand.muted }]}>Here’s what’s happening with your bookings today.</Text>
      {error ? <OperixAlert tone="error" message={error} /> : null}
      <View style={styles.statsGrid}>
        <Stat label="Today" value={String(todayBookings.length)} icon={CalendarPlus} />
        <Stat label="Upcoming" value={String(upcoming.length)} icon={ClipboardCheck} tone="success" />
        <Stat label="Completed" value={String(completed)} icon={ClipboardCheck} tone="warning" />
        <Stat label="Revenue" value={formatCurrency(revenue)} icon={DollarSign} />
      </View>
      <SectionTitle title="Today’s Schedule" action="Open calendar" onAction={() => tabNavigation.navigate('Calendar')} />
      {todayBookings.length ? todayBookings.slice(0, 3).map((booking) => <BookingCard key={booking.id} booking={booking} onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })} />) : <EmptyState title="Nothing scheduled today" description="Your team’s schedule is clear. Create a booking when the next customer calls." action="New booking" onAction={() => tabNavigation.navigate('NewBooking')} />}
      <SectionTitle title="Upcoming bookings" action="See all" onAction={() => tabNavigation.navigate('Bookings')} />
      {upcoming.length ? upcoming.map((booking) => <BookingCard key={booking.id} booking={booking} onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })} />) : <EmptyState title="No upcoming bookings" description="Upcoming reservations will appear here." action="Create booking" onAction={() => tabNavigation.navigate('NewBooking')} />}
      <SectionTitle title="Quick actions" />
      <View style={styles.quickRow}><QuickAction label="New booking" icon={CalendarPlus} onPress={() => tabNavigation.navigate('NewBooking')} /><QuickAction label="Add customer" icon={UserPlus} onPress={() => tabNavigation.navigate('Bookings')} /></View>
    </Screen>
  );
}

function Stat({ label, value, icon: Icon, tone = 'info' }: { label: string; value: string; icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; tone?: 'info' | 'success' | 'warning' }) {
  return <OperixStatCard label={label} value={value} icon={Icon} tone={tone} style={styles.stat} />;
}

function QuickAction({ label, icon: Icon, onPress }: { label: string; icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; onPress: () => void }) {
  return <OperixButton title={label} onPress={onPress} icon={Icon} variant="shortcut" style={styles.quickAction} />;
}

const styles = StyleSheet.create({
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  company: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  greeting: { fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginTop: 4 },
  intro: { fontSize: 14, lineHeight: 20, marginTop: 7, marginBottom: 18 },
  bell: { width: 42, height: 42, borderRadius: 14, backgroundColor: operixMobileTokens.colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', minHeight: 110, marginBottom: 0 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickAction: { flex: 1, minHeight: 74 },
});
