import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { GestureHandlerRootView, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { Armchair, LocateFixed, MapPinned, Minus, Plus, RotateCcw } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import type { DeskResource, FloorPlan } from '@invoice-monorepo/desk-types';
import { supabase } from '@invoice-monorepo/api';
import { deskApi, getDeskImageSource } from '../../services/deskApi';
import { brand } from '../../theme/brand';
import { t } from '../../lib/i18n';

function dateKey(value = new Date()) { return value.toISOString().slice(0, 10); }
function position(value: number | null | undefined, fallback: number) {
  const normalized = value == null ? fallback : value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

export function FloorScreen({ route }: { route?: { params?: { floor?: string; resourceId?: number } } }) {
  const { language } = useTheme();
  const navigation = useNavigation<any>();
  const requestedFloor = route?.params?.floor || '';
  const requestedResourceId = route?.params?.resourceId;
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [floor, setFloor] = useState('');
  const [resources, setResources] = useState<DeskResource[]>([]);
  const [imageSource, setImageSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [selected, setSelected] = useState<DeskResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);

  const load = useCallback(async () => {
    setError('');
    try {
      const [floorData, planData, resourceData] = await Promise.all([
        deskApi.getFloors(), deskApi.getFloorPlans(), deskApi.getResources({ date: dateKey(), type: 'desk' }),
      ]);
      setFloors(floorData);
      setPlans(planData);
      const requestedResource = requestedResourceId == null
        ? undefined
        : resourceData.find((item) => item.id === requestedResourceId);
      const nextFloor = requestedFloor && floorData.includes(requestedFloor)
        ? requestedFloor
        : requestedResource?.floor && floorData.includes(requestedResource.floor)
          ? requestedResource.floor
        : floor && floorData.includes(floor)
          ? floor
          : floorData[0] || '';
      setFloor(nextFloor);
      setResources(resourceData.filter((item) => item.type === 'desk' && (!nextFloor || item.floor === nextFloor)));
      const plan = planData.find((item) => item.floor === nextFloor) || planData[0];
      setImageSource(plan?.image_url ? await getDeskImageSource(plan.image_url) : null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('failed', language));
    } finally { setLoading(false); setRefreshing(false); }
  }, [floor, language, requestedFloor, requestedResourceId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  React.useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase.channel('operix-desk-mobile-floor').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, load).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const plan = useMemo(() => plans.find((item) => item.floor === floor) || plans[0], [floor, plans]);
  const imageWidth = 720;
  const imageHeight = 440;
  const activeResources = useMemo(() => resources.filter((item) => item.is_active), [resources]);

  React.useEffect(() => {
    if (requestedResourceId == null || !activeResources.length) return;
    const match = activeResources.find((item) => item.id === requestedResourceId);
    if (match) setSelected(match);
  }, [activeResources, requestedResourceId]);

  const changeFloor = async (nextFloor: string) => {
    setFloor(nextFloor); setSelected(null); setScale(1); scaleRef.current = 1;
    const nextPlan = plans.find((item) => item.floor === nextFloor);
    setImageSource(nextPlan?.image_url ? await getDeskImageSource(nextPlan.image_url) : null);
    try {
      const resourceData = await deskApi.getResources({ date: dateKey(), floor: nextFloor, type: 'desk' });
      setResources(resourceData.filter((item) => item.type === 'desk'));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t('failed', language)); }
  };

  const setZoom = (next: number) => { const value = Math.max(0.7, Math.min(2.2, next)); scaleRef.current = value; setScale(value); };
  const onPinch = (event: any) => { if (event.nativeEvent.state === State.END) setZoom(scaleRef.current * event.nativeEvent.scale); };

  if (loading) return <View style={styles.center}><ActivityIndicator color={brand.primary} size="large" /><Text style={styles.muted}>{t('loading', language)}</Text></View>;

  return <GestureHandlerRootView style={styles.root}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={brand.primary} />}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>{t('floor', language)}</Text><Text style={styles.title}>Live floor plan</Text><Text style={styles.subtitle}>Tap a desk to see availability and details.</Text></View><View style={styles.icon}><MapPinned color={brand.primary} size={21} /></View></View>
      {error ? <TouchableOpacity onPress={() => void load()} style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>{t('retry', language)}</Text></TouchableOpacity> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.floorOptions}>{floors.map((item) => <TouchableOpacity key={item} onPress={() => void changeFloor(item)} style={[styles.floorOption, item === floor && styles.floorOptionActive]}><Text style={[styles.floorOptionText, item === floor && styles.floorOptionTextActive]}>Floor {item}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.legend}><Legend color={brand.success} label="Available" /><Legend color={brand.primary} label="My desk" /><Legend color="#98A2B3" label="Reserved" /></View>
      <View style={styles.mapShell}>
        <View style={styles.mapToolbar}><Text style={styles.mapTitle}>{plan?.name || `Floor ${floor}`}</Text><View style={styles.mapActions}><TouchableOpacity onPress={() => setZoom(scale - 0.2)} style={styles.mapButton}><Minus color={brand.text} size={16} /></TouchableOpacity><TouchableOpacity onPress={() => setZoom(scale + 0.2)} style={styles.mapButton}><Plus color={brand.text} size={16} /></TouchableOpacity><TouchableOpacity onPress={() => setZoom(1)} style={styles.mapButton}><RotateCcw color={brand.text} size={15} /></TouchableOpacity><TouchableOpacity onPress={() => { const mine = activeResources.find((item) => item.is_mine); if (mine) setSelected(mine); }} style={styles.mapButton}><LocateFixed color={brand.primary} size={16} /></TouchableOpacity></View></View>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mapScroll}><ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={styles.mapScrollVertical}><PinchGestureHandler onHandlerStateChange={onPinch}><View style={[styles.map, { width: imageWidth * scale, height: imageHeight * scale }]}>{imageSource ? <Image source={imageSource} resizeMode="stretch" style={StyleSheet.absoluteFillObject} /> : <View style={styles.mapPlaceholder}><MapPinned color="#B8C7DE" size={34} /><Text style={styles.muted}>No floor image is configured for this floor.</Text></View>}{activeResources.map((resource) => <TouchableOpacity key={resource.id} onPress={() => setSelected(resource)} style={[styles.marker, { left: (position(resource.floor_plan_x, 0.5) * imageWidth * scale) - 15, top: (position(resource.floor_plan_y, 0.5) * imageHeight * scale) - 15, backgroundColor: resource.is_mine ? brand.primary : resource.is_available === false ? '#98A2B3' : brand.success }]}><Armchair color="#fff" size={13} /></TouchableOpacity>)}</View></PinchGestureHandler></ScrollView></ScrollView>
      </View>
      {selected ? <View style={styles.detail}><View style={styles.detailTop}><View style={styles.detailIcon}><Armchair color={brand.primary} size={20} /></View><View style={styles.detailCopy}><Text style={styles.detailTitle}>{selected.name}</Text><Text style={styles.muted}>Floor {selected.floor} · {selected.zone || 'Workspace'} · {selected.building}</Text></View><TouchableOpacity onPress={() => setSelected(null)}><Text style={styles.close}>Close</Text></TouchableOpacity></View><View style={styles.statusRow}><Text style={styles.statusLabel}>{selected.is_mine ? 'My reservation' : selected.is_available === false ? 'Reserved' : 'Available'}</Text><View style={[styles.statusDot, { backgroundColor: selected.is_mine ? brand.primary : selected.is_available === false ? '#98A2B3' : brand.success }]} /></View>{selected.amenities ? <Text style={styles.amenities}>{selected.amenities}</Text> : null}{selected.is_available && !selected.is_mine ? <TouchableOpacity onPress={() => navigation.navigate('Reserve')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Reserve this desk</Text></TouchableOpacity> : null}</View> : <View style={styles.info}><Armchair color={brand.primary} size={17} /><Text style={styles.infoText}>{activeResources.length} desks on this floor · pinch to zoom and drag to explore</Text></View>}
    </ScrollView>
  </GestureHandlerRootView>;
}

function Legend({ color, label }: { color: string; label: string }) { return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1 }, screen: { flex: 1, backgroundColor: brand.background }, content: { padding: 20, paddingBottom: 36 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.background }, header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }, eyebrow: { color: brand.primary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }, title: { marginTop: 5, color: brand.text, fontSize: 28, fontWeight: '800' }, subtitle: { marginTop: 6, color: brand.muted, fontSize: 13, lineHeight: 19 }, icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF3FF' }, floorOptions: { gap: 8, paddingBottom: 14 }, floorOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface }, floorOptionActive: { backgroundColor: '#EDF3FF', borderColor: '#AFC7FF' }, floorOptionText: { color: brand.text, fontSize: 12, fontWeight: '700' }, floorOptionTextActive: { color: brand.primary }, legend: { flexDirection: 'row', gap: 14, marginBottom: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 4 }, legendText: { color: brand.muted, fontSize: 10, fontWeight: '600' }, mapShell: { overflow: 'hidden', borderRadius: 18, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, mapToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: brand.border }, mapTitle: { color: brand.text, fontSize: 13, fontWeight: '800' }, mapActions: { flexDirection: 'row', gap: 6 }, mapButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: brand.border }, mapScroll: { minWidth: '100%' }, mapScrollVertical: { minHeight: 360 }, map: { position: 'relative', minWidth: 500, minHeight: 320, backgroundColor: '#F7FAFF' }, mapPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7FAFF' }, marker: { position: 'absolute', width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#101828', shadowOpacity: 0.18, shadowRadius: 4, elevation: 3 }, detail: { marginTop: 14, padding: 15, borderRadius: 18, backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border }, detailTop: { flexDirection: 'row', alignItems: 'center' }, detailIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF3FF' }, detailCopy: { flex: 1, marginLeft: 10 }, detailTitle: { color: brand.text, fontSize: 15, fontWeight: '800' }, close: { color: brand.primary, fontSize: 11, fontWeight: '800' }, statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }, statusLabel: { color: brand.text, fontSize: 12, fontWeight: '700' }, statusDot: { width: 9, height: 9, borderRadius: 5 }, amenities: { color: brand.muted, fontSize: 11, marginTop: 10 }, primaryButton: { alignItems: 'center', marginTop: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: brand.primary }, primaryButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, info: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, padding: 12, borderRadius: 13, backgroundColor: '#EDF3FF' }, infoText: { flex: 1, color: brand.primary, fontSize: 11, fontWeight: '700' }, muted: { color: brand.muted, fontSize: 12, marginTop: 5 }, errorBox: { padding: 13, borderRadius: 14, backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#FECACA', marginBottom: 13 }, errorText: { color: '#B42318', fontSize: 12 }, retry: { marginTop: 6, color: brand.primary, fontSize: 12, fontWeight: '800' },
});
