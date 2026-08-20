import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isAfter, parseISO, startOfToday } from 'date-fns';
import {
  Armchair,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  LocateFixed,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import {
  getEmployeeSummary,
  getMyReservations,
  getWhoIsInToday,
} from '../api/client';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard } from '../components/ui/Skeleton';
import { formatApiError } from '../lib/apiError';

function Stat({ label, value, detail, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value ?? '—'}</p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={20} /></span>
      </div>
    </div>
  );
}

function ReservationSummary({ reservation }) {
  if (!reservation) {
    return (
      <div className="flex min-h-[180px] flex-col items-start justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-brand-600 shadow-sm"><Armchair size={20} /></span>
        <p className="mt-4 font-semibold text-slate-800">No reservation today</p>
        <p className="mt-1 text-sm text-slate-500">Choose a desk and plan your office day.</p>
        <Link to="/reserve" className="mt-4 text-sm font-bold text-brand-600 hover:text-brand-700">Reserve a desk <ArrowRight className="ml-1 inline" size={15} /></Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg shadow-brand-600/20">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-100">Today's reservation</p><p className="mt-3 text-2xl font-bold">{reservation.resource?.name || 'Workspace resource'}</p><p className="mt-1 text-sm text-brand-100">Floor {reservation.resource?.floor} · {reservation.resource?.building || 'Office'}</p></div>
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">Confirmed</span>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-white/15 pt-4 text-sm"><span>{reservation.resource?.zone || 'Workspace'}</span><span>{reservation.start_time && reservation.end_time ? `${String(reservation.start_time).slice(0, 5)} – ${String(reservation.end_time).slice(0, 5)}` : 'All day'}</span></div>
      <Link to={`/floor-plan?resourceId=${reservation.resource_id}&floor=${encodeURIComponent(reservation.resource?.floor || '')}`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50">View on floor <MapPin size={15} /></Link>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [summaryData, reservationData, peopleData] = await Promise.all([
        getEmployeeSummary(),
        getMyReservations(),
        getWhoIsInToday(),
      ]);
      setSummary(summaryData);
      setReservations(reservationData);
      setPeople(peopleData);
    } catch (err) {
      setError(formatApiError(err, 'We could not load your workplace dashboard.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase
      .channel('operix-desk-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const today = startOfToday();
  const todayKey = format(today, 'yyyy-MM-dd');
  const todayReservation = reservations.find((item) => item.status === 'active' && item.date === todayKey);
  const upcoming = useMemo(() => reservations.filter((item) => item.status === 'active' && isAfter(parseISO(item.date), parseISO(todayKey))).slice(0, 4), [reservations, todayKey]);
  const bookedToday = people.length;
  const capacity = (summary?.available_desks ?? 0) + bookedToday;
  const workspaceName = user?.organization_name || user?.company_name || 'there';

  if (loading) {
    return <div className="space-y-6"><div className="h-28 animate-pulse rounded-3xl bg-slate-200/70" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} rows={2} />)}</div><div className="grid gap-6 lg:grid-cols-2"><SkeletonCard rows={6} /><SkeletonCard rows={6} /></div></div>;
  }

  return (
    <div className="space-y-6">
      <section className="standard-dashboard-hero">
        <div className="standard-dashboard-hero-copy"><p className="standard-dashboard-kicker">Workplace overview</p><h1>Welcome, {workspaceName}</h1><p>Here's what's happening in your workplace today.</p></div>
        <Link to="/reserve" className="standard-dashboard-hero-action"><Armchair size={17} /> Reserve a desk</Link>
      </section>

      {error && <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={load} className="inline-flex items-center gap-2 font-bold"><RefreshCw size={15} /> Retry</button></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Available desks" value={summary?.available_desks} detail="For today" icon={Armchair} tone="green" />
        <Stat label="Reserved today" value={bookedToday} detail="People in office" icon={CalendarCheck} tone="blue" />
        <Stat label="Available rooms" value={summary?.available_rooms} detail="Ready to book" icon={Building2} tone="violet" />
        <Stat label="Office capacity" value={capacity || '—'} detail={summary ? `${Math.round(summary.occupancy || 0)}% occupied` : 'Live availability'} icon={BarChart3} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="card p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Today's reservation</h2><p className="mt-1 text-sm text-slate-500">Your next place to work</p></div><Link to="/reservations" className="text-sm font-bold text-brand-600">View all</Link></div><ReservationSummary reservation={todayReservation} /></section>
        <section className="card p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Quick reserve</h2><p className="mt-1 text-sm text-slate-500">Find a suitable workspace quickly.</p></div><Armchair className="text-brand-600" size={22} /></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Link to="/reserve" className="flex items-center justify-between rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm font-bold text-brand-700 hover:bg-brand-50"><span className="flex items-center gap-3"><CalendarDays size={18} />Reserve a desk</span><ChevronRight size={17} /></Link><Link to="/floor-plan?type=room" className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><span className="flex items-center gap-3"><Building2 size={18} />Reserve a room</span><ChevronRight size={17} /></Link><Link to="/floor-plan?nearTeam=1" className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><span className="flex items-center gap-3"><LocateFixed size={18} />Near my team</span><ChevronRight size={17} /></Link></div></section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="card p-6"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">Who's in today</h2><p className="mt-1 text-sm text-slate-500">Colleagues with active desk reservations</p></div><Link to="/team" className="text-sm font-bold text-brand-600">See team</Link></div><div className="mt-5 space-y-2">{people.slice(0, 5).map((person) => <div key={person.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-slate-50"><div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{person.full_name?.charAt(0)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{person.full_name}</p><p className="truncate text-xs text-slate-500">Floor {person.floor} · {person.desk}</p></div><span className="hidden text-xs text-slate-400 sm:block">{person.team_name || 'Team member'}</span></div>)}{people.length === 0 && <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No colleagues have booked a desk today.</div>}</div></section>
        <section className="card overflow-hidden"><div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="text-lg font-bold text-slate-900">Upcoming reservations</h2><p className="mt-1 text-sm text-slate-500">Your confirmed workplace days</p></div><Link to="/reservations" className="text-sm font-bold text-brand-600">Manage</Link></div>{upcoming.length > 0 ? <div className="divide-y divide-slate-100">{upcoming.map((item) => <div key={item.id} className="flex items-center gap-4 px-6 py-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><span className="text-[10px] font-bold uppercase">{format(parseISO(item.date), 'MMM')}</span><span className="text-lg font-bold leading-none">{format(parseISO(item.date), 'd')}</span></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.resource?.name}</p><p className="truncate text-xs text-slate-500">Floor {item.resource?.floor} · {item.resource?.building || 'Office'}</p></div><span className="badge-green">Confirmed</span></div>)}</div> : <div className="px-6 py-12 text-center text-sm text-slate-500">No upcoming reservations. <Link to="/reserve" className="font-bold text-brand-600">Reserve a desk</Link></div>}</section>
      </div>

      <section className="card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Floor occupancy</h2><p className="mt-1 text-sm text-slate-500">Live occupancy by floor based on today's active reservations</p></div><Link to="/floor-plan" className="inline-flex items-center gap-2 text-sm font-bold text-brand-600">Open floor plan <ArrowRight size={15} /></Link></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{summary?.floor_overview?.map((floor) => <div key={floor.floor} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between text-sm"><span className="font-bold text-slate-700">Floor {floor.floor}</span><span className="font-bold text-brand-600">{floor.occupancy}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, floor.occupancy))}%` }} /></div></div>)}{!summary?.floor_overview?.length && <div className="col-span-full rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Floor occupancy data is not available yet.</div>}</div></section>
    </div>
  );
}
