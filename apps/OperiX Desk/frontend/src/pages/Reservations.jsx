import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isAfter, isBefore, parseISO, startOfToday } from 'date-fns';
import { Armchair, CalendarDays, CheckCircle2, Clock3, RefreshCw, XCircle } from 'lucide-react';
import { cancelReservation, getBookingLimits, getMyReservations } from '../api/client';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { SkeletonCard } from '../components/ui/Skeleton';
import { formatApiError } from '../lib/apiError';

function ReservationCard({ reservation, onCancel, cancelling }) {
  const isActive = reservation.status === 'active';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-200 hover:shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><CalendarDays size={19} /></div><div className="min-w-0"><p className="truncate text-base font-bold text-slate-900">{reservation.resource?.name || 'Workspace resource'}</p><p className="mt-1 text-sm text-slate-500">Floor {reservation.resource?.floor} · {reservation.resource?.building || 'Office'} · {reservation.resource?.zone}</p></div></div>
        <span className={isActive ? 'badge-green' : reservation.status === 'cancelled' ? 'badge-amber' : 'badge-red'}>{isActive ? 'Confirmed' : reservation.status.replace('_', ' ')}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600"><span className="font-semibold text-slate-800">{format(parseISO(reservation.date), 'EEEE, MMM d')}</span><span>{reservation.start_time && reservation.end_time ? `${String(reservation.start_time).slice(0, 5)} – ${String(reservation.end_time).slice(0, 5)}` : 'All day'}</span><span>{reservation.resource?.type === 'room' ? 'Meeting room' : 'Desk'}</span></div>
      {isActive && <div className="mt-4 flex flex-wrap gap-2"><Link to={`/floor-plan?resourceId=${reservation.resource_id}&floor=${encodeURIComponent(reservation.resource?.floor || '')}`} className="btn-secondary px-3 py-2 text-xs">View on floor</Link><Link to={`/reserve?resourceId=${reservation.resource_id}&floor=${encodeURIComponent(reservation.resource?.floor || '')}`} className="btn-secondary px-3 py-2 text-xs">Reserve again</Link><button type="button" onClick={() => onCancel(reservation)} disabled={cancelling === reservation.id} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">{cancelling === reservation.id ? 'Cancelling…' : 'Cancel'}</button></div>}
    </article>
  );
}

function Section({ title, count, children, empty }) {
  return <section className="card p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{count} reservation{count === 1 ? '' : 's'}</p></div>{title === 'Today' && <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">Office day</span>}</div><div className="mt-5 space-y-3">{count ? children : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">{empty}</div>}</div></section>;
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [limits, setLimits] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = startOfToday();
  const todayKey = format(today, 'yyyy-MM-dd');

  const load = useCallback(async () => {
    setError('');
    try {
      const [items, bookingLimits] = await Promise.all([getMyReservations(), getBookingLimits().catch(() => null)]);
      setReservations(items);
      setLimits(bookingLimits);
    } catch (err) {
      setError(formatApiError(err, 'We could not load your reservations.'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => ({
    today: reservations.filter((item) => item.status === 'active' && item.date === todayKey),
    upcoming: reservations.filter((item) => item.status === 'active' && isAfter(parseISO(item.date), parseISO(todayKey))),
    past: reservations.filter((item) => item.status === 'active' && isBefore(parseISO(item.date), parseISO(todayKey))),
    cancelled: reservations.filter((item) => item.status !== 'active'),
  }), [reservations, todayKey]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(cancelTarget.id);
    try { await cancelReservation(cancelTarget.id); setCancelTarget(null); await load(); } catch (err) { setError(formatApiError(err, 'Could not cancel this reservation.')); } finally { setCancelling(null); }
  };

  if (loading) return <div className="space-y-5"><SkeletonCard rows={3} /><SkeletonCard rows={5} /><SkeletonCard rows={5} /></div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-600">Workspace bookings</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">My reservations</h1><p className="mt-2 text-sm text-slate-500">Manage your confirmed desks, rooms, and workplace days.</p></div><Link to="/reserve" className="btn-primary"><Armchair size={17} /> Reserve a desk</Link></div>
    {error && <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={load} className="inline-flex items-center gap-2 font-bold"><RefreshCw size={15} /> Retry</button></div>}
    {limits && <div className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-800">You have <strong>{limits.active_reservations}</strong> active reservation{limits.active_reservations === 1 ? '' : 's'} and <strong>{limits.remaining_slots}</strong> booking slot{limits.remaining_slots === 1 ? '' : 's'} remaining. You can book up to {limits.max_booking_days_ahead} days ahead.</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="card flex items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><CalendarDays size={19} /></span><div><p className="text-2xl font-bold text-slate-900">{groups.today.length}</p><p className="text-xs text-slate-500">Today</p></div></div><div className="card flex items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-600"><Clock3 size={19} /></span><div><p className="text-2xl font-bold text-slate-900">{groups.upcoming.length}</p><p className="text-xs text-slate-500">Upcoming</p></div></div><div className="card flex items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={19} /></span><div><p className="text-2xl font-bold text-slate-900">{groups.past.length}</p><p className="text-xs text-slate-500">Past</p></div></div><div className="card flex items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600"><XCircle size={19} /></span><div><p className="text-2xl font-bold text-slate-900">{groups.cancelled.length}</p><p className="text-xs text-slate-500">Cancelled</p></div></div></div>
    <Section title="Today" count={groups.today.length} empty="No reservation today. Reserve a desk to plan your office day.">{groups.today.map((item) => <ReservationCard key={item.id} reservation={item} onCancel={setCancelTarget} cancelling={cancelling} />)}</Section>
    <Section title="Upcoming" count={groups.upcoming.length} empty="No upcoming reservations. Choose a day and find a desk.">{groups.upcoming.map((item) => <ReservationCard key={item.id} reservation={item} onCancel={setCancelTarget} cancelling={cancelling} />)}</Section>
    <div className="grid gap-6 lg:grid-cols-2"><Section title="Past" count={groups.past.length} empty="Your completed reservations will appear here.">{groups.past.slice(0, 8).map((item) => <ReservationCard key={item.id} reservation={item} onCancel={setCancelTarget} cancelling={cancelling} />)}</Section><Section title="Cancelled" count={groups.cancelled.length} empty="Cancelled reservations will appear here.">{groups.cancelled.slice(0, 8).map((item) => <ReservationCard key={item.id} reservation={item} onCancel={setCancelTarget} cancelling={cancelling} />)}</Section></div>
    <ConfirmDialog open={Boolean(cancelTarget)} title="Cancel reservation?" message={cancelTarget ? `${cancelTarget.resource?.name || 'This resource'} on ${format(parseISO(cancelTarget.date), 'EEEE, MMM d')} will be released for your organization.` : ''} confirmLabel="Cancel reservation" cancelLabel="Keep reservation" loading={Boolean(cancelling)} onConfirm={handleCancel} onCancel={() => !cancelling && setCancelTarget(null)} />
  </div>;
}
