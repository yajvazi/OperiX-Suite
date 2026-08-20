import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Armchair, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Layers3, MapPin, Sparkles } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import type { DeskResource, DeskUser, DeskReservation } from '@invoice-monorepo/desk-types';
import { deskApi } from '../../services/deskApi';
import { brand } from '../../theme/brand';
import { t } from '../../lib/i18n';

function keyFor(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }

export function ReserveScreen() {
  const { language } = useTheme();
  const [deskUser, setDeskUser] = useState<DeskUser | null>(null);
  const [date, setDate] = useState(keyFor(new Date()));
  const [floor, setFloor] = useState('');
  const [office, setOffice] = useState('');
  const [resourceType, setResourceType] = useState<'desk' | 'room'>('desk');
  const [floors, setFloors] = useState<string[]>([]);
  const [resources, setResources] = useState<DeskResource[]>([]);
  const [selected, setSelected] = useState<DeskResource | null>(null);
  const [step, setStep] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<DeskReservation | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [userData, floorData, resourceData] = await Promise.all([deskApi.getMe(), deskApi.getFloors(), deskApi.getResources({ date, type: resourceType })]);
      setDeskUser(userData); setFloors(floorData); setResources(resourceData.filter((item) => item.type === resourceType));
      setFloor((current) => current && floorData.includes(current) ? current : floorData[0] || '');
      setOffice((current) => resourceData.some((item) => item.type === resourceType && item.building === current)
        ? current
        : resourceData.find((item) => item.type === resourceType)?.building || '');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t('failed', language)); }
    finally { setLoading(false); }
  }, [date, language, resourceType]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const canBookRoom = deskUser?.role === 'admin' || deskUser?.role === 'manager' || deskUser?.role === 'team_leader' || deskUser?.permissions?.includes('reservation.manage');
  const offices = useMemo(() => [...new Set(resources.map((item) => item.building).filter(Boolean))], [resources]);
  const available = useMemo(() => resources.filter((item) => item.is_active && item.is_available !== false && (!floor || item.floor === floor) && (!office || item.building === office)), [floor, office, resources]);

  const chooseDate = (value: string) => { setDate(value); setSelected(null); setStep(1); };
  const submit = async () => {
    if (!selected) return;
    setBooking(true); setError('');
    try {
      const response = await deskApi.createReservation({ resource_id: selected.id, date, start_time: selected.type === 'room' ? startTime : null, end_time: selected.type === 'room' ? endTime : null });
      const reservation = Array.isArray(response) ? response[0] : response;
      setConfirmed(reservation); setSelected(null); setStep(1); await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'This desk was just reserved by another user. Choose another available desk.'); }
    finally { setBooking(false); }
  };

  if (loading && !resources.length) return <View style={styles.center}><ActivityIndicator color={brand.primary} size="large" /><Text style={styles.muted}>{t('loading', language)}</Text></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View><Text style={styles.eyebrow}>{t('reserve', language)}</Text><Text style={styles.title}>{t('reserveDesk', language)}</Text><Text style={styles.subtitle}>Choose a workplace resource and confirm it from the server.</Text></View><View style={styles.headerIcon}><Armchair color={brand.primary} size={21} /></View></View>
    {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
    {confirmed ? <View style={styles.confirmation}><View style={styles.check}><Check color="#fff" size={23} /></View><Text style={styles.confirmTitle}>{t('confirmed', language)}</Text><Text style={styles.confirmText}>{confirmed.resource?.name || selected?.name || 'Workspace resource'} · Floor {confirmed.resource?.floor || floor}</Text><TouchableOpacity onPress={() => setConfirmed(null)} style={styles.lightButton}><Text style={styles.lightButtonText}>Reserve another</Text></TouchableOpacity></View> : null}
    <View style={styles.stepper}>{['Office & date', 'Floor', 'Choose resource', 'Confirm'].map((label, index) => <View key={label} style={styles.stepItem}><View style={[styles.stepDot, step >= index + 1 && styles.stepDotActive]}><Text style={[styles.stepNumber, step >= index + 1 && styles.stepNumberActive]}>{index + 1}</Text></View><Text style={[styles.stepLabel, step === index + 1 && styles.stepLabelActive]}>{label}</Text></View>)}</View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}><CalendarDays color={brand.primary} size={18} /> {t('date', language)}</Text>
      <View style={styles.dateRow}><DateChoice label={t('today', language)} value={keyFor(new Date())} active={date === keyFor(new Date())} onPress={chooseDate} /><DateChoice label={t('tomorrow', language)} value={keyFor(addDays(new Date(), 1))} active={date === keyFor(addDays(new Date(), 1))} onPress={chooseDate} /><TouchableOpacity onPress={() => chooseDate(keyFor(addDays(new Date(), 2)))} style={styles.dateChoice}><Text style={styles.dateChoiceLabel}>Choose date</Text><Text style={styles.dateChoiceValue}>{date}</Text></TouchableOpacity></View>
      <Text style={[styles.cardTitle, { marginTop: 20 }]}><Building2 color={brand.primary} size={18} /> {t('office', language)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>{offices.map((item) => <Option key={item} label={item} active={office === item} onPress={() => { setOffice(item); setStep(Math.max(step, 1)); }} />)}{!offices.length ? <Text style={styles.muted}>No offices are available for this date.</Text> : null}</ScrollView>
      <Text style={[styles.cardTitle, { marginTop: 20 }]}><Layers3 color={brand.primary} size={18} /> {t('floorLabel', language)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>{floors.map((item) => <Option key={item} label={`Floor ${item}`} active={floor === item} onPress={() => { setFloor(item); setStep(Math.max(step, 2)); }} />)}</ScrollView>
      <Text style={[styles.cardTitle, { marginTop: 20 }]}><Armchair color={brand.primary} size={18} /> Resource</Text>
      <View style={styles.typeRow}><Option label="Desk" active={resourceType === 'desk'} onPress={() => { setResourceType('desk'); setSelected(null); }} /><Option label="Room" active={resourceType === 'room'} disabled={!canBookRoom} onPress={() => { setResourceType('room'); setSelected(null); }} /></View>
      {resourceType === 'room' ? <View style={styles.timeRow}><View style={styles.timeField}><Text style={styles.fieldLabel}>Start</Text><TextInput value={startTime} onChangeText={setStartTime} style={styles.timeInput} keyboardType="numbers-and-punctuation" /></View><View style={styles.timeField}><Text style={styles.fieldLabel}>End</Text><TextInput value={endTime} onChangeText={setEndTime} style={styles.timeInput} keyboardType="numbers-and-punctuation" /></View></View> : <TouchableOpacity style={styles.preference}><Sparkles color={brand.primary} size={17} /><View><Text style={styles.preferenceTitle}>Smart availability</Text><Text style={styles.muted}>Only resources with real availability and metadata are shown.</Text></View></TouchableOpacity>}
    </View>
    <View style={styles.resourceHeader}><View><Text style={styles.sectionTitle}>{t('available', language)}</Text><Text style={styles.muted}>{available.length} available for {date}</Text></View><TouchableOpacity onPress={() => setStep(Math.min(4, step + 1))}><Text style={styles.link}>Next <ChevronRight color={brand.primary} size={15} /></Text></TouchableOpacity></View>
    {available.map((resource) => <TouchableOpacity key={resource.id} onPress={() => { setSelected(resource); setStep(4); }} style={[styles.resourceCard, selected?.id === resource.id && styles.resourceSelected]}><View style={styles.resourceIcon}><Armchair color={brand.primary} size={19} /></View><View style={styles.resourceCopy}><Text style={styles.resourceNameSmall}>{resource.name}</Text><Text style={styles.muted}>Floor {resource.floor} · {resource.zone} · {resource.building}</Text>{resource.amenities ? <Text style={styles.amenities}>{resource.amenities}</Text> : null}</View><View style={styles.availableDot} /></TouchableOpacity>)}{!available.length ? <View style={styles.empty}><MapPin color={brand.muted} size={22} /><Text style={styles.emptyTitle}>{t('noResources', language)}</Text><Text style={styles.muted}>Try another floor or date.</Text></View> : null}
    {selected ? <View style={styles.confirmBar}><View><Text style={styles.confirmBarTitle}>{selected.name}</Text><Text style={styles.muted}>Floor {selected.floor} · {date}</Text></View><TouchableOpacity disabled={booking} onPress={() => void submit()} style={[styles.primaryButton, booking && styles.disabled]}>{booking ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryButtonText}>{t('confirm', language)}</Text><Check color="#fff" size={15} /></>}</TouchableOpacity></View> : null}
  </ScrollView>;
}

function DateChoice({ label, value, active, onPress }: { label: string; value: string; active: boolean; onPress: (value: string) => void }) { return <TouchableOpacity onPress={() => onPress(value)} style={[styles.dateChoice, active && styles.optionActive]}><Text style={[styles.dateChoiceLabel, active && styles.optionTextActive]}>{label}</Text><Text style={[styles.dateChoiceValue, active && styles.optionTextActive]}>{value}</Text></TouchableOpacity>; }
function Option({ label, active, onPress, disabled = false }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) { return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.option, active && styles.optionActive, disabled && styles.disabledOption]}><Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.background }, content: { padding: 20, paddingBottom: 35 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.background }, header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 21 }, eyebrow: { color: brand.primary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }, title: { color: brand.text, fontSize: 28, fontWeight: '800', marginTop: 5 }, subtitle: { color: brand.muted, fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 300 }, headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EDF3FF', alignItems: 'center', justifyContent: 'center' }, errorBox: { borderRadius: 14, padding: 13, backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#FECACA', marginBottom: 14 }, errorText: { color: '#B42318', fontSize: 12, lineHeight: 18 }, confirmation: { alignItems: 'center', borderRadius: 20, padding: 20, backgroundColor: '#E9F9F0', borderWidth: 1, borderColor: '#A7F3D0', marginBottom: 16 }, check: { width: 45, height: 45, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.success }, confirmTitle: { marginTop: 10, color: '#067647', fontSize: 18, fontWeight: '800' }, confirmText: { marginTop: 5, color: '#067647', fontSize: 13 }, lightButton: { marginTop: 13, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11, backgroundColor: '#fff' }, lightButtonText: { color: brand.primary, fontSize: 12, fontWeight: '800' }, stepper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 17 }, stepItem: { alignItems: 'center', gap: 5 }, stepDot: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E8F0' }, stepDotActive: { backgroundColor: brand.primary }, stepNumber: { color: brand.muted, fontSize: 11, fontWeight: '800' }, stepNumberActive: { color: '#fff' }, stepLabel: { color: brand.muted, fontSize: 9, fontWeight: '600' }, stepLabelActive: { color: brand.primary }, card: { borderRadius: 19, padding: 16, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, color: brand.text, fontSize: 14, fontWeight: '800' }, dateRow: { flexDirection: 'row', gap: 8, marginTop: 11 }, dateChoice: { flex: 1, minHeight: 54, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: '#FBFCFE' }, dateChoiceLabel: { color: brand.muted, fontSize: 10, fontWeight: '700' }, dateChoiceValue: { color: brand.text, fontSize: 11, fontWeight: '800', marginTop: 3 }, horizontalOptions: { gap: 8, paddingTop: 10 }, option: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: '#FBFCFE' }, optionActive: { backgroundColor: '#EDF3FF', borderColor: '#AFC7FF' }, optionText: { color: brand.text, fontSize: 12, fontWeight: '700' }, optionTextActive: { color: brand.primary }, disabledOption: { opacity: 0.4 }, typeRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, timeRow: { flexDirection: 'row', gap: 10, marginTop: 13 }, timeField: { flex: 1 }, fieldLabel: { color: brand.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 }, timeInput: { borderWidth: 1, borderColor: brand.border, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, color: brand.text }, preference: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, marginTop: 13, borderRadius: 13, backgroundColor: '#F8FAFC' }, preferenceTitle: { color: brand.text, fontSize: 12, fontWeight: '800' }, muted: { color: brand.muted, fontSize: 11, marginTop: 3 }, resourceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 }, sectionTitle: { color: brand.text, fontSize: 18, fontWeight: '800' }, link: { flexDirection: 'row', alignItems: 'center', color: brand.primary, fontSize: 12, fontWeight: '800' }, resourceCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 17, marginBottom: 9, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, resourceSelected: { borderColor: brand.primary, backgroundColor: '#F3F7FF' }, resourceIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EDF3FF' }, resourceCopy: { flex: 1, marginLeft: 11 }, resourceNameSmall: { color: brand.text, fontSize: 14, fontWeight: '800' }, amenities: { color: brand.muted, fontSize: 10, marginTop: 4 }, availableDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: brand.success }, empty: { alignItems: 'center', paddingVertical: 30 }, emptyTitle: { color: brand.text, fontSize: 14, fontWeight: '800', marginTop: 8 }, confirmBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 13, marginTop: 8, borderRadius: 16, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border, shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }, confirmBarTitle: { color: brand.text, fontSize: 14, fontWeight: '800' }, primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12, backgroundColor: brand.primary }, primaryButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.6 },
});
