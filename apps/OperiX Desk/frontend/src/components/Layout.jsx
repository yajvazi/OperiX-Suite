import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Armchair,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileClock,
  Grid2X2,
  LayoutDashboard,
  Map,
  ReceiptText,
  Settings2,
  Sparkles,
  Users,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import { getRecentActivity, searchWorkspace } from '../api/client';
import BrandMark from './BrandMark';
import { OperixAppShell, OperixMobileNavigation, OperixSidebar, OperixTopBar } from '@invoice-monorepo/app-shell';

const applicationLinks = [
  { label: 'OperiX Suite', key: 'suite', env: 'VITE_OPERIX_SUITE_URL', fallback: 'https://suite.operixsuite.com', icon: Grid2X2, color: '#1f2937' },
  { label: 'OperiX Invoice', key: 'invoice', env: 'VITE_OPERIX_INVOICE_URL', fallback: 'https://invoice.operixsuite.com', icon: ReceiptText, color: '#8b5cf6' },
  { label: 'OperiX HR', key: 'hr', env: 'VITE_OPERIX_HR_URL', fallback: 'https://hr.operixsuite.com', icon: UsersRound, color: '#ec4899' },
  { label: 'OperiX Booking', key: 'booking', env: 'VITE_OPERIX_BOOKING_URL', fallback: 'https://booking.operixsuite.com', icon: CalendarDays, color: '#004ffe' },
  { label: 'OperiX Desk', key: 'desk', current: true, icon: Armchair, color: '#10b981' },
];

const primaryLinks = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/reserve', icon: Armchair, label: 'Reserve' },
  { to: '/floor-plan', icon: Map, label: 'Floor Plan' },
  { to: '/reservations', icon: CalendarDays, label: 'My Reservations' },
  { to: '/team', icon: Users, label: 'Team', permission: 'team.read' },
  { to: '/admin/resources', icon: ClipboardList, label: 'Resources', permission: 'resource.manage' },
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics', permission: 'analytics.read' },
  { to: '/assistant', icon: Sparkles, label: 'AI Assistant' },
];

const administrationLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Workspace', end: true },
  { to: '/admin/builder', icon: Map, label: 'Floor Builder', permission: 'floor.manage' },
  { to: '/admin/users', icon: UsersRound, label: 'Users', permission: 'workspace.manage' },
  { to: '/admin/reservations', icon: CalendarDays, label: 'Reservations', permission: 'reservation.manage' },
  { to: '/admin/resources', icon: ClipboardList, label: 'Resources', permission: 'resource.manage' },
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics', permission: 'analytics.read' },
  { to: '/admin/audit', icon: FileClock, label: 'Audit Log', permission: 'audit.read' },
];

const deskLabelKeys = {
  Dashboard: 'dashboard', Reserve: 'reserve', 'Floor Plan': 'floorPlan', 'My Reservations': 'reservations',
  Team: 'team', Resources: 'resources', Analytics: 'analytics', 'AI Assistant': 'assistant', Workspace: 'workspace',
  'Floor Builder': 'floorBuilder', Users: 'users', 'Reservations': 'reservations', 'Audit Log': 'auditLog', Settings: 'settings',
};

function deskLabel(translate, value) {
  return translate(deskLabelKeys[value] || value);
}

function ProductMark({ app, muted = false }) {
  const Icon = app.icon;
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-white"
      style={{ backgroundColor: muted ? '#f1f5f9' : app.color, color: muted ? '#94a3b8' : '#fff' }}
      aria-hidden="true"
    >
      <Icon size={14} strokeWidth={2.1} />
    </span>
  );
}

function hasPermission(user, permission) {
  return !permission || user?.role === 'admin' || user?.permissions?.includes(permission);
}

export default function Layout() {
  const { user, logout, isAdmin, isManager } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ resources: [], users: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    getRecentActivity().then(setRecentActivity).catch(() => setRecentActivity([]));
  }, [location.pathname]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults({ resources: [], users: [] });
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      searchWorkspace(query)
        .then((data) => {
          setSearchResults({ resources: data.resources ?? [], users: data.users ?? [] });
          setSearchOpen(true);
        })
        .catch(() => setSearchResults({ resources: [], users: [] }));
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const visiblePrimary = primaryLinks.filter((link) => hasPermission(user, link.permission));
  const visibleAdmin = administrationLinks.filter((link) => hasPermission(user, link.permission));
  const closeSearch = () => setSearchOpen(false);
  const hasSearchResults = searchResults.resources.length > 0 || searchResults.users.length > 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleResourceOpen = (resource) => {
    navigate(`/floor-plan?resourceId=${resource.id}&floor=${encodeURIComponent(resource.floor)}&type=${resource.type}`);
    setSearchQuery('');
    setSearchResults({ resources: [], users: [] });
    closeSearch();
  };

  const sharedPrimary = visiblePrimary.map(({ to, icon, label }) => ({ href: to, icon, label: deskLabel(t, label), active: location.pathname === to || (!to.endsWith('/') && location.pathname.startsWith(`${to}/`)) }));
  const sharedSecondary = [
    ...(isManager ? [{ href: '/team-builder', icon: UsersRound, label: 'Team Builder' }, { href: '/emergency-staffing', icon: AlertTriangle, label: 'Emergency Staffing' }] : []),
    ...(isAdmin ? visibleAdmin.map(({ to, icon, label }) => ({ href: to, icon, label: deskLabel(t, label), active: location.pathname === to || location.pathname.startsWith(`${to}/`) })) : []),
  ].map((item) => ({ ...item, active: item.active !== undefined ? item.active : (location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)) }));
  const renderSidebarLink = ({ href, className, children, onClick, 'aria-current': ariaCurrent }) => <NavLink to={href} className={className} onClick={onClick} aria-current={ariaCurrent}>{children}</NavLink>;
  const renderTopbarLink = ({ href, className, children, onClick, 'aria-label': ariaLabel }) => <NavLink to={href} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</NavLink>;
  const topbarApps = applicationLinks.map((app) => ({ ...app, href: app.current ? '/' : import.meta.env[app.env] || app.fallback, icon: <ProductMark app={app} /> }));
  const searchResultSlot = searchOpen && searchQuery.trim().length >= 2 ? <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">{hasSearchResults ? <div className="max-h-[420px] overflow-y-auto">{searchResults.resources.length > 0 && <div><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Desks & rooms</p>{searchResults.resources.map((resource) => <button key={`resource-${resource.id}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => handleResourceOpen(resource)} className="flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"><div><p className="text-sm font-semibold text-slate-800">{resource.name}</p><p className="text-xs text-slate-500">Floor {resource.floor} · {resource.zone}</p></div><span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold capitalize text-brand-700">{resource.type}</span></button>)}</div>}{searchResults.users.length > 0 && <div className="mt-1"><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Colleagues</p>{searchResults.users.map((person) => <button key={`user-${person.id}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { navigate('/team'); closeSearch(); }} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"><p className="text-sm font-semibold text-slate-800">{person.full_name}</p><p className="text-xs text-slate-500">{person.job_title || person.role}{person.team_name ? ` · ${person.team_name}` : ''}</p></button>)}</div>}</div> : <p className="px-3 py-4 text-sm text-slate-500">No matching workspace records found.</p>}</div> : null;
  const mobileItems = [
    { href: '/', label: t('home'), icon: <LayoutDashboard size={19} />, active: location.pathname === '/' },
    { href: '/reserve', label: t('reserve'), icon: <Armchair size={19} />, active: location.pathname.startsWith('/reserve') },
    { href: '/floor-plan', label: t('floorPlan'), icon: <Map size={19} />, active: location.pathname.startsWith('/floor-plan') },
    { href: '/reservations', label: t('bookings'), icon: <CalendarDays size={19} />, active: location.pathname.startsWith('/reservations') },
  ];
  const sidebar = (
    <OperixSidebar
      logo={<BrandMark size={30} showWordmark darkText />}
      ariaLabel="Desk navigation"
      navSections={[{ label: 'Workspace', items: sharedPrimary }, { label: 'Manage', items: sharedSecondary }]}
      settingsItem={{ href: '/profile', icon: Settings2, label: deskLabel(t, 'Settings'), active: location.pathname === '/profile' || location.pathname.startsWith('/profile/') }}
      workspaceName={user?.organization_name || 'OperiX organization'}
      user={{ initials: (user?.full_name || user?.email || 'O').slice(0, 2).toUpperCase(), name: user?.full_name || user?.email || 'OperiX user', role: user?.job_title || user?.desk_role || user?.role || 'Workspace member' }}
      theme={theme}
      onToggleTheme={toggleTheme}
      onSignOut={handleLogout}
      mobileOpen={mobileNavOpen}
      onCloseMobile={() => setMobileNavOpen(false)}
      renderLink={renderSidebarLink}
    />
  );

  return <OperixAppShell sidebar={sidebar} className="desk-shell" mainClassName="desk-shell-main flex min-w-0 flex-1 flex-col">
    <OperixTopBar
      apps={topbarApps}
      search={{ value: searchQuery, onChange: (value) => { setSearchQuery(value); setSearchOpen(true); }, onFocus: () => hasSearchResults && setSearchOpen(true), onBlur: () => window.setTimeout(closeSearch, 150), placeholder: t('searchPlaceholder'), resultSlot: searchResultSlot }}
      help={{ href: '/profile', label: 'Help' }}
      notifications={{ count: recentActivity.length, onClick: () => setNotificationsOpen((value) => !value) }}
      primaryAction={{ label: t('reserveDesk'), icon: <Armchair size={17} />, onClick: () => navigate('/reserve') }}
      extraActions={<button type="button" onClick={() => setLocale(locale === 'en' ? 'sq' : 'en')} className="hidden rounded-[9px] border border-slate-200 px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:border-brand-200 hover:text-brand-700 sm:inline-flex" aria-label={t('language')}>{locale.toUpperCase()} · {t('switchLanguage')}</button>}
      user={{ initials: (user?.full_name || user?.email || 'O').slice(0, 2).toUpperCase(), href: '/profile', label: 'Open profile' }}
      onMobileMenu={() => setMobileNavOpen(true)}
      renderLink={renderTopbarLink}
    />
    {notificationsOpen && <div className="fixed left-4 right-4 top-[68px] z-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:absolute sm:left-auto sm:right-8 sm:top-16 sm:w-96"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">{t('recentActivity')}</h3><button type="button" onClick={() => setNotificationsOpen(false)} className="text-xs font-semibold text-slate-400">{t('close')}</button></div>{recentActivity.length > 0 ? <div className="space-y-2">{recentActivity.map((activity, index) => <div key={`${activity}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">{activity}</div>)}</div> : <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">{t('noRecentActivity')}</div>}</div>}
    <div className="flex-1 overflow-auto px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-8"><Outlet /></div>
    <OperixMobileNavigation items={mobileItems} primaryAction={{ href: '/reserve', label: t('reserveDesk'), icon: <Armchair size={22} /> }} moreAction={{ label: t('more'), icon: <Grid2X2 size={19} />, onClick: () => setMobileNavOpen(true) }} renderLink={renderTopbarLink} />
  </OperixAppShell>;
}
