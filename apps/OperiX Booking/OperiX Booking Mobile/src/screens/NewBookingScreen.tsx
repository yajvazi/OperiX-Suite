import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTheme } from '@invoice-monorepo/hooks';
import { getAvailableSlots } from '@invoice-monorepo/booking/api';
import type { AvailabilitySlot } from '@invoice-monorepo/booking';
import { supabase } from '@invoice-monorepo/api';
import { OperixAlert, OperixButton, OperixInput } from '@invoice-monorepo/ui';
import { useBookingMobile } from '../context/BookingMobileContext';
import { brand } from '../theme/brand';
import type { MainTabParamList } from '../navigation/types';
import { Header, Screen, formatBookingDate, formatBookingTime, formatCurrency } from '../components/booking-ui';

function localIsoAfter(start: string, durationMinutes: number) {
  return new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString();
}

export function NewBookingScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { isDark } = useTheme();
  const { companyId, services, customers, locations, staff, addBooking } = useBookingMobile();
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const service = services.find((item) => item.id === serviceId) || null;
  useEffect(() => {
    if (step !== 3 || !service || !companyId) return;
    const timer = setTimeout(() => void loadSlots(), 180);
    return () => clearTimeout(timer);
  }, [companyId, date, service, staffId, locationId, step]);

  async function loadSlots() {
    if (!companyId || !service) return;
    setLoadingSlots(true);
    setError('');
    try {
      const nextSlots = await getAvailableSlots(supabase, { companyId, serviceId: service.id, date, locationId, staffId });
      setSlots(nextSlots.filter((slot) => slot.available));
      setSelectedSlot(null);
      setStep(3);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Availability could not be loaded.');
    } finally {
      setLoadingSlots(false);
    }
  }

  async function saveBooking() {
    if (!companyId || !service || !selectedSlot || (!customerId && !guestName.trim())) return;
    setSaving(true);
    setError('');
    try {
      await addBooking({
        companyId,
        customerId,
        guestName: customerId ? null : guestName.trim(),
        serviceId: service.id,
        locationId,
        staffId,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt || localIsoAfter(selectedSlot.startsAt, service.duration_minutes),
        participantCount: 1,
        quantity: 1,
        source: 'mobile',
      });
      navigation.navigate('Bookings');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The booking could not be created.');
    } finally {
      setSaving(false);
    }
  }

  const canContinue = step === 1 ? Boolean(service) : step === 2 ? Boolean(customerId || guestName.trim()) : Boolean(selectedSlot);

  return (
    <Screen>
      <Header title="New booking" subtitle="A fast, conflict-checked reservation flow." action="Cancel" onAction={() => navigation.navigate('Home')} />
      <View style={styles.progress}><StepNumber number={1} label="Service" active={step === 1} complete={step > 1} /><View style={styles.progressLine} /><StepNumber number={2} label="Customer" active={step === 2} complete={step > 2} /><View style={styles.progressLine} /><StepNumber number={3} label="Time" active={step === 3} complete={false} /></View>
      {error ? <OperixAlert tone="error" message={error} /> : null}
      {step === 1 ? <ServiceStep services={services} selectedId={serviceId} onSelect={setServiceId} isDark={isDark} /> : null}
      {step === 2 ? <CustomerStep customers={customers} selectedId={customerId} guestName={guestName} onSelect={setCustomerId} onGuestName={setGuestName} isDark={isDark} locations={locations} locationId={locationId} onLocation={setLocationId} staff={staff} staffId={staffId} onStaff={setStaffId} /> : null}
      {step === 3 ? <TimeStep date={date} onDate={setDate} slots={slots} selected={selectedSlot} onSelect={setSelectedSlot} loading={loadingSlots} isDark={isDark} service={service} /> : null}
      <View style={styles.footer}>{step > 1 ? <OperixButton title="Back" onPress={() => setStep((current) => current - 1)} variant="outline" icon={ChevronLeft} fullWidth={false} style={styles.secondaryButton} /> : <View />}{step < 3 ? <OperixButton title={step === 2 && loadingSlots ? 'Checking…' : 'Continue'} onPress={() => step === 2 ? void loadSlots() : setStep(2)} icon={ChevronRight} loading={loadingSlots} disabled={!canContinue} style={styles.primaryButton} /> : <OperixButton title="Create booking" onPress={() => void saveBooking()} icon={Check} loading={saving} disabled={!canContinue} style={styles.primaryButton} />}</View>
    </Screen>
  );
}

function StepNumber({ number, label, active, complete }: { number: number; label: string; active: boolean; complete: boolean }) {
  return <View style={styles.step}><View style={[styles.stepCircle, (active || complete) && styles.stepActive]}>{complete ? <Check color="#fff" size={14} /> : <Text style={[styles.stepNumber, (active || complete) && styles.stepNumberActive]}>{number}</Text>}</View><Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text></View>;
}

function ServiceStep({ services, selectedId, onSelect, isDark }: { services: ReturnType<typeof useBookingMobile>['services']; selectedId: string; onSelect: (id: string) => void; isDark: boolean }) {
  return <View><Text style={[styles.stepTitle, { color: isDark ? '#fff' : brand.text }]}>Choose a service</Text><Text style={[styles.stepDescription, { color: isDark ? '#AEBBD0' : brand.muted }]}>Pick the service and we’ll find valid times.</Text>{services.filter((item) => item.is_active).map((item) => <Pressable key={item.id} onPress={() => onSelect(item.id)} style={[styles.option, { backgroundColor: selectedId === item.id ? '#EAF1FF' : isDark ? '#10233F' : brand.surface, borderColor: selectedId === item.id ? brand.primary : isDark ? '#203755' : brand.border }]}><View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: isDark ? '#fff' : brand.text }]}>{item.name}</Text><Text style={[styles.optionSubtitle, { color: isDark ? '#AEBBD0' : brand.muted }]}>{item.duration_minutes} min · {formatCurrency(item.price, item.currency)}</Text></View>{selectedId === item.id ? <Check color={brand.primary} size={20} /> : null}</Pressable>)}</View>;
}

function CustomerStep({ customers, selectedId, guestName, onSelect, onGuestName, isDark, locations, locationId, onLocation, staff, staffId, onStaff }: { customers: ReturnType<typeof useBookingMobile>['customers']; selectedId: string | null; guestName: string; onSelect: (id: string | null) => void; onGuestName: (name: string) => void; isDark: boolean; locations: ReturnType<typeof useBookingMobile>['locations']; locationId: string | null; onLocation: (id: string | null) => void; staff: ReturnType<typeof useBookingMobile>['staff']; staffId: string | null; onStaff: (id: string | null) => void }) {
  return <View><Text style={[styles.stepTitle, { color: isDark ? '#fff' : brand.text }]}>Choose a customer</Text><Text style={[styles.stepDescription, { color: isDark ? '#AEBBD0' : brand.muted }]}>Use a saved customer or create a guest reservation.</Text>{customers.slice(0, 5).map((item) => <Pressable key={item.id} onPress={() => onSelect(item.id)} style={[styles.compactOption, { backgroundColor: selectedId === item.id ? '#EAF1FF' : isDark ? '#10233F' : brand.surface, borderColor: selectedId === item.id ? brand.primary : isDark ? '#203755' : brand.border }]}><Text style={[styles.optionTitle, { color: isDark ? '#fff' : brand.text }]}>{item.name}</Text><Text style={[styles.optionSubtitle, { color: isDark ? '#AEBBD0' : brand.muted }]}>{item.phone || item.email || 'Customer profile'}</Text></Pressable>)}<OperixInput label="Guest name" value={guestName} onChangeText={(value) => { onGuestName(value); if (value) onSelect(null); }} placeholder="Or enter guest name" containerStyle={styles.fieldInput} /><Text style={[styles.fieldLabel, { color: isDark ? '#AEBBD0' : brand.muted }]}>Location</Text><View style={styles.choiceRow}>{locations.map((item) => <Pressable key={item.id} onPress={() => onLocation(item.id)} style={[styles.choice, { backgroundColor: locationId === item.id ? brand.primary : isDark ? '#10233F' : brand.surface, borderColor: locationId === item.id ? brand.primary : isDark ? '#203755' : brand.border }]}><Text style={{ color: locationId === item.id ? '#fff' : isDark ? '#fff' : brand.text, fontSize: 12, fontWeight: '800' }}>{item.name}</Text></Pressable>)}</View><Text style={[styles.fieldLabel, { color: isDark ? '#AEBBD0' : brand.muted }]}>Provider (optional)</Text><View style={styles.choiceRow}>{staff.map((item) => <Pressable key={item.id} onPress={() => onStaff(item.id)} style={[styles.choice, { backgroundColor: staffId === item.id ? brand.primary : isDark ? '#10233F' : brand.surface, borderColor: staffId === item.id ? brand.primary : isDark ? '#203755' : brand.border }]}><Text style={{ color: staffId === item.id ? '#fff' : isDark ? '#fff' : brand.text, fontSize: 12, fontWeight: '800' }}>{item.display_name}</Text></Pressable>)}</View></View>;
}

function TimeStep({ date, onDate, slots, selected, onSelect, loading, isDark, service }: { date: string; onDate: (value: string) => void; slots: AvailabilitySlot[]; selected: AvailabilitySlot | null; onSelect: (slot: AvailabilitySlot) => void; loading: boolean; isDark: boolean; service: ReturnType<typeof useBookingMobile>['services'][number] | null }) {
  return <View><Text style={[styles.stepTitle, { color: isDark ? '#fff' : brand.text }]}>Choose a time</Text><Text style={[styles.stepDescription, { color: isDark ? '#AEBBD0' : brand.muted }]}>{service?.name || 'Service'} · {service?.duration_minutes || 0} minutes</Text><OperixInput label="Date" value={date} onChangeText={onDate} placeholder="YYYY-MM-DD" containerStyle={styles.fieldInput} /><Text style={[styles.dateHint, { color: isDark ? '#AEBBD0' : brand.muted }]}>Showing availability for {formatBookingDate(date + 'T12:00:00', true)}.</Text>{loading ? <ActivityIndicator color={brand.primary} style={{ marginTop: 20 }} /> : <View style={styles.slotGrid}>{slots.map((slot) => <Pressable key={slot.startsAt} onPress={() => onSelect(slot)} style={[styles.slot, { backgroundColor: selected?.startsAt === slot.startsAt ? brand.primary : isDark ? '#10233F' : brand.surface, borderColor: selected?.startsAt === slot.startsAt ? brand.primary : isDark ? '#203755' : brand.border }]}><Clock3 color={selected?.startsAt === slot.startsAt ? '#fff' : brand.primary} size={15} /><Text style={{ color: selected?.startsAt === slot.startsAt ? '#fff' : isDark ? '#fff' : brand.text, fontWeight: '800', fontSize: 13 }}>{formatBookingTime(slot.startsAt)}</Text></Pressable>)}</View>}</View>;
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  progressLine: { flex: 1, height: 1, backgroundColor: brand.border, marginHorizontal: 8 },
  step: { alignItems: 'center', gap: 5 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, alignItems: 'center', justifyContent: 'center' },
  stepActive: { backgroundColor: brand.primary, borderColor: brand.primary },
  stepNumber: { color: brand.muted, fontSize: 12, fontWeight: '800' },
  stepNumberActive: { color: '#fff' },
  stepLabel: { color: brand.muted, fontSize: 10, fontWeight: '700' },
  stepLabelActive: { color: brand.primary },
  stepTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  stepDescription: { fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 16 },
  option: { minHeight: 72, borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 14, fontWeight: '800' },
  optionSubtitle: { fontSize: 12, marginTop: 4 },
  compactOption: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 8 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 14, marginBottom: 12 },
  fieldInput: { marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '800', marginTop: 9, marginBottom: 8 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  dateHint: { fontSize: 12, marginBottom: 12 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  slot: { minWidth: '30%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 9 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 13 },
  secondaryText: { color: brand.primary, fontWeight: '800', fontSize: 13 },
  primaryButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: brand.primary, borderRadius: 13, paddingHorizontal: 15 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  disabled: { opacity: 0.5 },
  error: { color: brand.error, fontSize: 13, lineHeight: 19 },
});
