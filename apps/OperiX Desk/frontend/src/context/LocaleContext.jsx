import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeLocale, setAppLocale, t as sharedT } from '@invoice-monorepo/i18n';

const deskTranslations = {
  en: {
    dashboard: 'Dashboard', reserve: 'Reserve', floorPlan: 'Floor Plan', reservations: 'My Reservations',
    team: 'Team', resources: 'Resources', analytics: 'Analytics', assistant: 'AI Assistant', workspace: 'Workspace',
    floorBuilder: 'Floor Builder', users: 'Users', auditLog: 'Audit Log', settings: 'Settings', managerTools: 'Manager tools',
    administration: 'Administration', workplaceOperations: 'Workplace operations', applications: 'OperiX applications', current: 'Current',
    home: 'Home', bookings: 'Bookings', more: 'More', searchPlaceholder: 'Search desks, rooms, colleagues...',
    reserveDesk: 'Reserve Desk', signOut: 'Sign out', recentActivity: 'Recent activity', close: 'Close',
    noRecentActivity: 'No recent activity yet.', noMatchingRecords: 'No matching workspace records found.',
    desksRooms: 'Desks & rooms', colleagues: 'Colleagues', membershipRequired: 'Membership required',
    organization: 'OperiX organization', account: 'OperiX account', language: 'Language', switchLanguage: 'Shqip',
  },
  sq: {
    dashboard: 'Paneli', reserve: 'Rezervo', floorPlan: 'Plani i katit', reservations: 'Rezervimet e mia',
    team: 'Ekipi', resources: 'Burimet', analytics: 'Analitika', assistant: 'Asistenti AI', workspace: 'Hapësira e punës',
    floorBuilder: 'Ndërtuesi i katit', users: 'Përdoruesit', auditLog: 'Ditari i auditimit', settings: 'Cilësimet', managerTools: 'Mjetet e menaxherit',
    administration: 'Administrimi', workplaceOperations: 'Operacionet e zyrës', applications: 'Aplikacionet OperiX', current: 'Aktiv',
    home: 'Kreu', bookings: 'Rezervimet', more: 'Më shumë', searchPlaceholder: 'Kërko tavolina, dhoma, kolegë...',
    reserveDesk: 'Rezervo tavolinë', signOut: 'Dil', recentActivity: 'Aktiviteti i fundit', close: 'Mbyll',
    noRecentActivity: 'Nuk ka aktivitet të fundit.', noMatchingRecords: 'Nuk u gjetën të dhëna të hapësirës.',
    desksRooms: 'Tavolina dhe dhoma', colleagues: 'Kolegët', membershipRequired: 'Kërkohet anëtarësimi',
    organization: 'Organizata OperiX', account: 'Llogaria OperiX', language: 'Gjuha', switchLanguage: 'English',
  },
};

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(localStorage.getItem('operix-desk-language')));
  useEffect(() => { setAppLocale(locale); localStorage.setItem('operix-desk-language', locale); document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({
    locale,
    setLocale: (next) => setLocaleState(normalizeLocale(next)),
    t: (key) => deskTranslations[locale][key] || sharedT(key, locale),
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used within a LocaleProvider');
  return value;
}
