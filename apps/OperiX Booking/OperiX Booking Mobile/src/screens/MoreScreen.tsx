import React from 'react';
import { Alert } from 'react-native';
import { Globe2, Moon } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { OperixAccountMenu, OperixListItem, OperixSection, OperixSettingsScreen } from '@invoice-monorepo/ui';
import { useBookingMobile } from '../context/BookingMobileContext';

export function MoreScreen() {
  const { isDark, language, setLanguage, setThemeMode, themeMode } = useTheme();
  const { user, companyName } = useBookingMobile();
  const { signOut } = useAuth();
  function handleSignOut() {
    Alert.alert('Sign out of OperiX?', 'You can sign back in with the same account on any OperiX app.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void signOut() }]);
  }

  return (
    <OperixSettingsScreen title="More" subtitle="Your OperiX Booking workspace.">
      <OperixAccountMenu
        name={user?.user_metadata?.first_name || 'OperiX user'}
        email={user?.email || 'Signed-in account'}
        items={[
          { id: 'organization', title: companyName, subtitle: 'Current organization', onPress: () => Alert.alert('Organization switcher', 'Organization switching follows your existing OperiX workspace membership.') },
          { id: 'profile', title: 'Profile and account', subtitle: 'Shared OperiX account', onPress: () => undefined },
        ]}
        onSignOut={handleSignOut}
      />
      <OperixSection title="Preferences">
        <OperixListItem icon={Globe2} title="Language" subtitle={language === 'sq' ? 'Albanian' : 'English'} onPress={() => void setLanguage(language === 'sq' ? 'en' : 'sq')} showChevron />
        <OperixListItem icon={Moon} title="Appearance" subtitle={themeMode === 'system' ? 'System default' : themeMode === 'dark' ? 'Dark' : 'Light'} onPress={() => void setThemeMode(isDark ? 'light' : 'dark')} showChevron />
      </OperixSection>
    </OperixSettingsScreen>
  );
}
