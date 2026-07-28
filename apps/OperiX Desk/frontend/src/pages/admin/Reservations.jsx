import { useEffect, useState } from 'react';
import { CalendarDays, Pencil, XCircle } from 'lucide-react';
import {
  cancelReservation,
  getAllReservations,
  getResources,
  updateReservation,
} from '../../api/client';
import PageHeader from '../../components/ui/PageHeader';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { SkeletonTable } from '../../components/ui/Skeleton';

const emptyForm = {
  reservationId: null,
  resource_id: '',
  date: '',
  start_time: '',
  end_time: '',
};

export default function AdminReservations() {
  const [reservations, setReservations] = useState([]);
  const [resources, setResources] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [editing, setEditing] = useState(emptyForm);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyReservationId, setBusyReservationId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReservations = async () => {
    setLoading(true);
    const reservationData = await getAllReservations(filterDate || null);
    setReservations(reservationData);
    setLoading(false);
  };

  const formatApiError = (err, fallback) =>
    String(err?.response?.data?.detail ?? err?.message ?? fallback);

  useEffect(() => {
    getResources().then(setResources).catch(() => setResources([]));
  }, []);

  useEffect(() => {
    loadReservations();
  }, [filterDate]);

  const startEdit = (reservation) => {
    setEditing({
      reservationId: reservation.id,
      resource_id: reservation.resource_id,
      date: reservation.date,
      start_time: reservation.start_time ?? '',
      end_time: reservation.end_time ?? '',
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusyReservationId(editing.reservationId);
    try {
      await updateReservation(editing.reservationId, {
        resource_id: Number(editing.resource_id),
        date: editing.date,
        start_time: editing.start_time || null,
        end_time: editing.end_time || null,
      });
      setEditing(emptyForm);
      setMessage('Reservation updated.');
      await loadReservations();
    } catch (err) {
      setError(formatApiError(err, 'Could not update reservation.'));
    } finally {
      setBusyReservationId(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setError('');
    setMessage('');
    setCancelling(true);
    setBusyReservationId(cancelTarget.id);
    try {
      await cancelReservation(cancelTarget.id);
      setMessage('Reservation cancelled.');
      setCancelTarget(null);
      await loadReservations();
    } catch (err) {
      setError(formatApiError(err, 'Could not cancel reservation.'));
    } finally {
      setCancelling(false);
      setBusyReservationId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="All Employee Reservations"
        subtitle="Review, edit and cancel employee and room bookings"
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <CalendarDays size={16} />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="input-field w-auto"
              />
            </label>
          </div>
        }
      />

      {message && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {editing.reservationId && (
        <form onSubmit={handleSave} className="card mb-6 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={editing.resource_id}
            onChange={(e) => setEditing({ ...editing, resource_id: e.target.value })}
            className="input-field"
            required
          >
            <option value="">Select resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name} ({resource.type})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={editing.date}
            onChange={(e) => setEditing({ ...editing, date: e.target.value })}
            className="input-field"
            required
          />
          <input
            type="time"
            value={editing.start_time}
            onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
            className="input-field"
          />
          <input
            type="time"
            value={editing.end_time}
            onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
            className="input-field"
          />
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busyReservationId === editing.reservationId} className="btn-primary">
              {busyReservationId === editing.reservationId ? 'Saving...' : 'Save reservation'}
            </button>
            <button type="button" onClick={() => setEditing(emptyForm)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable rows={7} columns={7} />
      ) : (
      <div className="card max-h-[calc(100dvh-14rem)] overflow-auto overscroll-contain sm:max-h-none">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => (
              <tr key={reservation.id} className="border-t border-slate-100">
                <td className="px-4 py-3.5 font-medium text-slate-900">{reservation.user_name}</td>
                <td className="px-4 py-3.5 text-slate-700">{reservation.resource?.name}</td>
                <td className="px-4 py-3.5 capitalize text-slate-600">{reservation.resource?.type}</td>
                <td className="px-4 py-3.5 text-slate-600">{reservation.date}</td>
                <td className="px-4 py-3.5 text-slate-600">
                  {reservation.start_time && reservation.end_time
                    ? `${reservation.start_time} - ${reservation.end_time}`
                    : 'All day'}
                </td>
                <td className="px-4 py-3.5">
                  <span className={reservation.status === 'active' ? 'badge-green capitalize' : 'badge-amber capitalize'}>
                    {reservation.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(reservation)}
                      disabled={busyReservationId === reservation.id || reservation.status !== 'active'}
                      className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelTarget(reservation)}
                      disabled={busyReservationId === reservation.id || reservation.status !== 'active'}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <XCircle size={15} />
                      {busyReservationId === reservation.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel reservation?"
        message={
          cancelTarget
            ? `${cancelTarget.user_name}'s ${cancelTarget.resource?.name ?? 'reservation'} for ${cancelTarget.date} will be cancelled and the resource will become available again.`
            : ''
        }
        confirmLabel="Cancel reservation"
        cancelLabel="Keep reservation"
        loading={cancelling}
        onConfirm={handleCancelConfirm}
        onCancel={() => {
          if (!cancelling) setCancelTarget(null);
        }}
      />
    </div>
  );
}
