import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Building2, CalendarDays, Globe2, Users } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { OperixAccountMenu, OperixAlert, OperixButton, OperixListItem, OperixLoadingState, OperixSection, OperixScreen, OperixSettingsScreen } from '@invoice-monorepo/ui';
import type { DeskUser } from '@invoice-monorepo/desk-types';
import { deskApi } from '../../services/deskApi';
import { brand } from '../../theme/brand';
import { t } from '../../lib/i18n';

export function MoreScreen() {
  const { user, signOut } = useAuth();
  const { language, setLanguage } = useTheme();
  const navigation = useNavigation<any>();
  const [deskUser, setDeskUser] = useState<DeskUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setDeskUser(await deskApi.getMe()); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : t('failed', language)); }
    finally { setLoading(false); }
  }, [language]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const manager = deskUser?.permissions?.includes('reservation.manage') || deskUser?.permissions?.includes('workspace.manage');
  const webUrl = process.env.EXPO_PUBLIC_DESK_WEB_URL;
  const firstName = deskUser?.full_name?.split(' ')[0] || user?.user_metadata?.first_name || 'OperiX user';
  if (loading) return <OperixScreen><OperixLoadingState label={t('loading', language)} /></OperixScreen>;

  return <OperixSettingsScreen title="More" subtitle="Account, preferences and workplace tools.">
    {error ? <OperixAlert tone="error" message={error} actionLabel={t('retry', language)} onAction={() => void load()} /> : null}
    <OperixAccountMenu name={deskUser?.full_name || firstName} email={deskUser?.email || user?.email || '—'} items={[]} />
    <OperixSection title="Workplace">
      <OperixListItem icon={Building2} title="Floor plan" subtitle="Explore desks and availability" onPress={() => navigation.navigate('Floor')} showChevron />
      <OperixListItem icon={CalendarDays} title="My reservations" subtitle="View, change or cancel bookings" onPress={() => navigation.navigate('Bookings')} showChevron />
      <OperixListItem icon={Users} title="Find colleagues" subtitle="See who is working from the office" onPress={() => navigation.navigate('Home')} showChevron />
      {manager && webUrl ? <OperixListItem icon={Building2} title="Workspace management" subtitle="Open the admin workspace on web" onPress={() => void Linking.openURL(webUrl)} showChevron /> : null}
    </OperixSection>
    <OperixSection title="Preferences">
      <OperixListItem icon={Globe2} title="Language" subtitle={language === 'sq' ? 'Albanian' : 'English'} trailing={<View style={styles.languageRow}><OperixButton title="EN" onPress={() => void setLanguage('en')} variant={language === 'en' ? 'secondary' : 'ghost'} size="small" fullWidth={false} /><OperixButton title="SQ" onPress={() => void setLanguage('sq')} variant={language === 'sq' ? 'secondary' : 'ghost'} size="small" fullWidth={false} /></View>} />
    </OperixSection>
    <OperixButton title={t('signOut', language)} onPress={() => void signOut()} variant="danger" />
    <Text style={styles.footer}>OperiX Desk · Shared OperiX account</Text>
  </OperixSettingsScreen>;
}

const styles = StyleSheet.create({
  languageRow: { flexDirection: 'row', gap: 4 },
  footer: { marginTop: 23, marginBottom: 36, color: brand.subtle, fontSize: 10, textAlign: 'center' },
});
