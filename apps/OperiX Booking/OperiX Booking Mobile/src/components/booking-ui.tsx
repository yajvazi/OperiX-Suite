import React from 'react';
import { View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { localizedBookingStatus } from '@invoice-monorepo/booking';
import type { BookingRecord, BookingStatus } from '@invoice-monorepo/booking';
import { useTheme } from '@invoice-monorepo/hooks';
import {
  OperixBadge,
  OperixButton,
  OperixCard,
  OperixEmptyState,
  OperixHeader,
  OperixRecordCard,
  OperixScrollableScreen,
  OperixSearchInput,
  OperixSection,
  operixMobileTokens,
  statusToneFor,
} from '@invoice-monorepo/ui';

export function formatBookingDate(value: string, includeYear = false) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(includeYear ? { year: 'numeric' } : {}) }).format(new Date(value));
}

export function formatBookingTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export function displayBookingName(booking: BookingRecord) {
  return booking.service?.name || 'Booking';
}

export function statusColor(status: BookingStatus) {
  const tone = statusToneFor(status);
  return tone === 'success' ? operixMobileTokens.colors.success : tone === 'warning' ? operixMobileTokens.colors.warning : tone === 'error' ? operixMobileTokens.colors.error : operixMobileTokens.colors.primary;
}

export function Screen({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return <OperixScrollableScreen refreshing={refreshing} onRefresh={onRefresh} contentContainerStyle={{ paddingBottom: 112 }}>{children}</OperixScrollableScreen>;
}

export function Header({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <OperixHeader product="OperiX Booking" title={title} subtitle={subtitle} right={action && onAction ? <OperixButton title={action} onPress={onAction} variant="secondary" size="small" fullWidth={false} /> : undefined} />;
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: object; onPress?: () => void }) {
  return <OperixCard onPress={onPress} style={[{ marginBottom: 12 }, style]}>{children}</OperixCard>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <OperixSection title={title} action={action} onAction={onAction} />;
}

export function StatusPill({ status }: { status: BookingStatus }) {
  const { language } = useTheme();
  return <OperixBadge status={status} label={localizedBookingStatus(status, language === 'sq' ? 'sq' : 'en')} />;
}

export function BookingCard({ booking, onPress }: { booking: BookingRecord; onPress?: () => void }) {
  return <OperixRecordCard
    title={displayBookingName(booking)}
    subtitle={booking.booking_number}
    status={booking.status}
    onPress={onPress}
    leading={<View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: operixMobileTokens.colors.softBlue }}><CalendarDays color={operixMobileTokens.colors.primary} size={18} /></View>}
    metadata={[`${formatBookingDate(booking.starts_at)} · ${formatBookingTime(booking.starts_at)}`, booking.customer?.name || booking.guest_name || 'Guest customer', booking.location?.name || ''].filter(Boolean)}
  />;
}

export function EmptyState({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  return <OperixEmptyState title={title} description={description} actionLabel={action} onAction={onAction} icon={CalendarDays} />;
}

export function SearchField({ value, onChangeText, placeholder = 'Search bookings' }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return <OperixSearchInput value={value} onChangeText={onChangeText} placeholder={placeholder} autoCapitalize="none" />;
}
