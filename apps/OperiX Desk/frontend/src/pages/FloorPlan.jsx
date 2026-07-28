import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Calendar, Filter, Layers, LocateFixed } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  addFavorite,
  createReservation,
  createTeamBookings,
  getFloorPlans,
  getFloors,
  getResources,
  getMyReservations,
  getTeamMembers,
  getTeamDeskRecommendations,
  getZones,
  removeFavorite,
} from '../api/client';
import DeskDetailPanel from '../components/DeskDetailPanel';
import ResourceDetailsModal from '../components/ResourceDetailsModal';
import PageHeader from '../components/ui/PageHeader';
import { SkeletonBlock, SkeletonCard } from '../components/ui/Skeleton';
import { formatApiError } from '../lib/apiError';
import { ZONE_OPTIONS } from '../lib/constants';
import { getAlternativeDesks, isResourceAvailable, isResourceReservedByOther } from '../lib/desks';
import { useAuth } from '../context/AuthContext';
import { sortByNaturalName } from '../lib/sort';

const STATUS = {
  available: { dot: 'bg-emerald-500', ring: 'ring-emerald-300', label: 'Available' },
  reserved: { dot: 'bg-red-500', ring: 'ring-red-300', label: 'Reserved' },
  mine: { dot: 'bg-blue-500', ring: 'ring-blue-300', label: 'My Reservation' },
  selected: { dot: 'bg-amber-400', ring: 'ring-amber-300', label: 'Selected' },
};

export default function FloorPlan() {
  const [searchParams] = useSearchParams();
  const resourceId = searchParams.get('resourceId');
  const floorFromQuery = searchParams.get('floor') ?? '';
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [floor, setFloor] = useState(floorFromQuery);
  const [zoneFilters, setZoneFilters] = useState([]);
  const [type, setType] = useState(searchParams.get('type') ?? '');
  const nearTeam = searchParams.get('nearTeam') === '1';
  const [floors, setFloors] = useState([]);
  const [zones, setZones] = useState([]);
  const [resources, setResources] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [teamHint, setTeamHint] = useState('');
  const [message, setMessage] = useState('');
  const [missingPlanImages, setMissingPlanImages] = useState({});
  const [reservationMode, setReservationMode] = useState('all_day');
  const [roomStartTime, setRoomStartTime] = useState('09:00');
  const [roomEndTime, setRoomEndTime] = useState('17:00');
  const [teamBookingOpen, setTeamBookingOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamBookingBusy, setTeamBookingBusy] = useState(false);
  const [teamBookingMessage, setTeamBookingMessage] = useState('');
  const [teamAssignments, setTeamAssignments] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(0);
  const { user } = useAuth();
  const canUseTeamDeskFinder = user?.role === 'employee' && Boolean(user?.team_name);

  useEffect(() => {
    if (floorFromQuery && floorFromQuery !== floor) {
      setFloor(floorFromQuery);
    }
  }, [floorFromQuery, floor]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFloors(), getFloorPlans()])
      .then(([f, planData]) => {
        if (cancelled) return;
        setFloors(f);
        setPlans(planData);
        if (f.length && !floor) setFloor(f[0]);
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (floor) getZones(floor).then(setZones);
  }, [floor]);

  const zone = zoneFilters.length === 1 ? zoneFilters[0] : undefined;

  useEffect(() => {
    let cancelled = false;
    setResourcesLoading(true);
    if (nearTeam && canUseTeamDeskFinder) {
      getTeamDeskRecommendations(date).then((data) => {
      if (cancelled) return;
      setTeamHint(
          data.team_zone
            ? `Team desks are usually near ${data.team_zone}`
            : 'No team desk history yet, showing a broad set of suggestions',
        );
        setResources(
          sortByNaturalName(user?.role === 'employee' ? data.resources.filter((r) => r.type !== 'room') : data.resources),
        );
        if (data.resources?.length && !floor) {
          setFloor(data.resources[0].floor);
        }
      }).finally(() => {
        if (!cancelled) setResourcesLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    getResources({
      date,
      floor: floor || undefined,
      zone,
      type: type || undefined,
    }).then((data) => {
      if (cancelled) return;
        const filtered =
        zoneFilters.length > 1
          ? data.filter((r) => zoneFilters.includes(r.zone))
          : data;
      setResources(sortByNaturalName(user?.role === 'employee' ? filtered.filter((r) => r.type !== 'room') : filtered));
    }).finally(() => {
      if (!cancelled) setResourcesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [date, floor, zone, zoneFilters, type, nearTeam, user?.role, canUseTeamDeskFinder]);

  useEffect(() => {
    setReservationMode(selected?.type === 'room' ? 'slot' : 'all_day');
  }, [selected?.id, selected?.type]);

  useEffect(() => {
    if (!resourceId || !resources.length) return;

    const match = resources.find((resource) => String(resource.id) === resourceId);
    if (match) {
      setSelected(match);
    }
  }, [resourceId, resources]);

  useEffect(() => {
    if (!teamBookingOpen || user?.role !== 'team_leader') return;
    getTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [teamBookingOpen, user?.role]);

  useEffect(() => {
    if (user?.role === 'employee' && type === 'room') {
      setType('');
    }
  }, [type, user?.role]);

  const plan = plans.find((p) => p.floor === floor);
  const maxDate = format(addDays(new Date(), 14), 'yyyy-MM-dd');
  const alternativeDesks = selected ? getAlternativeDesks(resources, selected) : [];
  const canReserveResource = (resource) =>
    resource?.type !== 'amenity' &&
    (!resource?.restricted_to_team_leaders || user?.role === 'team_leader');

  const getStatus = (r) => {
    if (selected?.id === r.id) return 'selected';
    if (r.is_mine) return 'mine';
    if (isResourceReservedByOther(r)) return 'reserved';
    return 'available';
  };

  const toggleZone = (z) => {
    setZoneFilters((prev) =>
      prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z],
    );
  };

  const handleBook = async () => {
    if (!selected) return;
    if (selected.type !== 'room' && isResourceReservedByOther(selected)) {
      setMessage('This desk is already reserved. Choose an available desk.');
      return;
    }
    if (selected.type === 'amenity') {
      setMessage('Amenities are map labels only and cannot be reserved.');
      toast.info('Amenities are map labels only.');
      return;
    }
    if (!canReserveResource(selected)) {
      setMessage('This resource can only be reserved by team leaders.');
      toast.warn('This resource can only be reserved by team leaders.');
      return;
    }
    setBooking(true);
    setMessage('');
    try {
      const latestResources = await getResources({
        date,
        floor: floor || undefined,
        zone,
        type: type || undefined,
      });
      const latestSelected = latestResources.find((resource) => resource.id === selected.id);
      if (!latestSelected) {
        setMessage('This seat is no longer available on the current floor plan.');
        return;
      }
      if (selected.type !== 'room' && isResourceReservedByOther(latestSelected)) {
        setSelected(latestSelected);
        setResources(sortByNaturalName(latestResources));
        setMessage(
          latestSelected.reserved_by
            ? `This seat was just reserved by ${latestSelected.reserved_by}. Choose another available seat.`
            : 'This seat was just reserved. Choose another available seat.',
        );
        return;
      }

      if (selected.type === 'desk') {
        const myReservations = await getMyReservations();
        const alreadyBookedDesk = myReservations.some(
          (reservation) =>
            reservation.status === 'active' &&
            reservation.date === date &&
            reservation.resource?.type === 'desk',
        );

        if (alreadyBookedDesk) {
          setMessage('You can only reserve one desk per day.');
          toast.warn('You can only reserve one desk per day.');
          return;
        }
      }

      const startTime = selected.type === 'room' && reservationMode === 'slot' ? roomStartTime : null;
      const endTime = selected.type === 'room' && reservationMode === 'slot' ? roomEndTime : null;
      await createReservation(selected.id, date, startTime, endTime, recurringWeeks);
      setMessage('Reservation confirmed successfully!');
      toast.success('Reservation confirmed.');
      const updated = await getResources({
        date,
        floor,
        zone,
        type: type || undefined,
      });
      setResources(sortByNaturalName(updated));
      setSelected(null);
      setDetailsOpen(false);
      setShowRecurring(false);
      setRecurringWeeks(0);
    } catch (err) {
      const msg = formatApiError(err, 'Booking failed');
      if ((msg.toLowerCase().includes('already booked') || msg.toLowerCase().includes('already reserved')) && selected) {
        const refreshed = await getResources({
          date,
          floor: floor || undefined,
          zone,
          type: type || undefined,
        }).catch(() => resources);
        setResources(sortByNaturalName(refreshed));
        const refreshedSelected = refreshed.find((resource) => resource.id === selected.id);
        if (refreshedSelected) setSelected(refreshedSelected);
        const alternatives = getAlternativeDesks(refreshed, refreshedSelected ?? selected);
        if (alternatives.length) {
          setMessage(`${msg} Try ${alternatives[0].name} on floor ${alternatives[0].floor}.`);
        } else {
          setMessage(msg);
        }
      } else {
        setMessage(msg);
      }
      toast.error(msg);
    } finally {
      setBooking(false);
    }
  };

  const openTeamBooking = () => {
    if (!selected || selected.type !== 'desk') return;
    setTeamBookingMessage('');
    setTeamAssignments({});
    setTeamBookingOpen(true);
  };

  const closeTeamBooking = () => {
    setTeamBookingOpen(false);
    setTeamBookingMessage('');
    setTeamAssignments({});
  };

  const handleTeamBookingSubmit = async () => {
    if (!selected) return;
    const assignments = Object.entries(teamAssignments)
      .map(([userId, resourceId]) => ({ user_id: Number(userId), resource_id: Number(resourceId) }))
      .filter((item) => item.user_id && item.resource_id);
    if (!assignments.length) {
      setTeamBookingMessage('Choose a desk for at least one teammate.');
      return;
    }
    setTeamBookingBusy(true);
    setTeamBookingMessage('');
    try {
      await createTeamBookings(date, assignments, recurringWeeks);
      setTeamBookingMessage('Team desks reserved successfully.');
      const updated = await getResources({
        date,
        floor,
        zone,
        type: type || undefined,
      });
      setResources(sortByNaturalName(updated));
      setSelected(null);
      setDetailsOpen(false);
      closeTeamBooking();
      setShowRecurring(false);
      setRecurringWeeks(0);
      toast.success('Team desks reserved.');
    } catch (err) {
      const msg = formatApiError(err, 'Could not reserve team desks.');
      setTeamBookingMessage(msg);
      toast.error(msg);
    } finally {
      setTeamBookingBusy(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!selected) return;
    setFavoriteBusy(true);
    setMessage('');
    try {
      const updated = selected.is_favorite
        ? await removeFavorite(selected.id)
        : await addFavorite(selected.id);
      setSelected(updated);
      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      const refreshed = await getResources({
        date,
        floor: floor || undefined,
        zone,
        type: type || undefined,
      });
      const filtered =
        zoneFilters.length > 1
          ? refreshed.filter((r) => zoneFilters.includes(r.zone))
          : refreshed;
      setResources(sortByNaturalName(filtered));
      setSelected((prev) =>
        prev && filtered.some((r) => r.id === prev.id)
          ? filtered.find((r) => r.id === prev.id) ?? updated
          : updated,
      );
    } catch (err) {
      const errorMessage = formatApiError(err, 'Could not update favorites.');
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setFavoriteBusy(false);
    }
  };

  const openDetails = () => {
    setDetailsOpen(true);
  };

  const selectResource = (resource) => {
    setSelected(resource);
    setMessage('');
    if (window.matchMedia('(max-width: 1279px)').matches) {
      setDetailsOpen(true);
    }
  };

  const closeDetails = () => {
    setDetailsOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Reserve a seat"
        subtitle="Browse availability and reserve desks or meeting rooms visually"
      />
      {nearTeam && canUseTeamDeskFinder && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <LocateFixed size={16} />
          {teamHint || 'Finding desks near your team...'}
        </div>
      )}
      {nearTeam && !canUseTeamDeskFinder && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Team desk recommendations are available only to employees who are assigned to a team.
        </div>
      )}

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
        Green desks are free for {format(new Date(date + 'T12:00:00'), 'MMM d')}. Red desks are already booked.
        One desk per day, no double booking.
      </div>

      <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-4">
        <div className="min-w-0">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Calendar size={12} /> Date
          </label>
          <input
            type="date"
            value={date}
            min={format(new Date(), 'yyyy-MM-dd')}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            className="input-field w-full lg:w-auto"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Layers size={12} /> Floor
          </label>
          <select
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="input-field w-full lg:w-auto lg:min-w-[140px]"
          >
            {floors.map((f) => (
              <option key={f} value={f}>
                Floor {f}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <label className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resource Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="input-field w-full lg:w-auto lg:min-w-[140px]"
          >
            <option value="">All resources</option>
            <option value="desk">Desks only</option>
            {user?.role !== 'employee' && <option value="room">Rooms only</option>}
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_24rem]">
        <aside className="card hidden w-56 shrink-0 p-4 lg:block">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Filter size={16} /> Zones
          </div>
          <div className="mt-3 space-y-2">
            {(zones.length ? zones : ZONE_OPTIONS).map((z) => (
              <label
                key={z}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={zoneFilters.length === 0 || zoneFilters.includes(z)}
                  onChange={() => toggleZone(z)}
                  className="rounded border-slate-300 text-brand-600"
                />
                {z}
              </label>
            ))}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legend</p>
            <div className="mt-3 space-y-2.5">
              {Object.entries(STATUS).map(([key, { dot, label }]) => (
                <div key={key} className="flex items-center gap-2.5 text-sm text-slate-600">
                  <span className={`h-3.5 w-3.5 rounded-full ${dot}`} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="relative isolate flex min-h-[520px] min-w-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200 p-3 shadow-inner">
          {initialLoading || resourcesLoading ? (
            <div className="w-full space-y-4 p-4">
              <SkeletonBlock className="h-[320px] w-full rounded-xl" />
              <div className="grid grid-cols-3 gap-3">
                <SkeletonBlock className="h-3" />
                <SkeletonBlock className="h-3" />
                <SkeletonBlock className="h-3" />
              </div>
            </div>
          ) : plan ? (
            <div className="relative isolate max-h-[720px] w-full">
              {!missingPlanImages[plan.id] ? (
                <img
                  src={plan.image_url}
                  alt={`Floor ${floor}`}
                  className="block max-h-[720px] w-full object-contain"
                  onError={() => {
                    setMissingPlanImages((current) => ({ ...current, [plan.id]: true }));
                    toast.error('This floor plan image is missing. Ask an admin to replace it.');
                  }}
                />
              ) : (
                <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-6 text-center text-amber-900">
                  <p className="text-sm font-semibold">Floor plan image is missing</p>
                  <p className="max-w-md text-sm">
                    The floor exists, but the uploaded image is no longer available.
                    Replace the floor plan image from Admin Floor Builder.
                  </p>
                </div>
              )}
              {resources
                .filter((r) => r.floor_plan_x != null && r.floor_plan_y != null)
                .map((r) => {
                  if (r.type === 'amenity') {
                    return (
                      <div
                        key={r.id}
                        title={`${r.name} - ${r.zone}`}
                        style={{
                          left: `${r.floor_plan_x}%`,
                          top: `${r.floor_plan_y}%`,
                        }}
                        className="absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm sm:text-xs"
                      >
                        {r.name}
                      </div>
                    );
                  }
                  const status = getStatus(r);
                  const s = STATUS[status];
                  return (
                    <button
                      key={r.id}
                      type="button"
                      title={`${r.name} - ${s.label}`}
                      onClick={() => selectResource(r)}
                      style={{
                        left: `${r.floor_plan_x}%`,
                        top: `${r.floor_plan_y}%`,
                      }}
                      className={`absolute z-[1] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 transition hover:scale-110 sm:h-5 sm:w-5 lg:h-6 lg:w-6 ${s.dot} ${s.ring}`}
                    />
                  );
                })}
            </div>
          ) : (
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
          )}
          <div className="absolute left-4 top-4 z-[2] rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow backdrop-blur">
            Floor {floor} · {format(new Date(date + 'T12:00:00'), 'EEE, MMM d')}
          </div>
        </div>

        <aside className="hidden xl:block">
          {resourcesLoading ? (
            <div className="sticky top-24">
              <SkeletonCard rows={8} />
            </div>
          ) : selected ? (
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
              <DeskDetailPanel
                desk={selected}
                date={date}
                onClose={() => setSelected(null)}
                onBook={handleBook}
                onBookTeam={openTeamBooking}
                onMoreDetails={openDetails}
                onSelectAlternative={(deskOption) => {
                  selectResource(deskOption);
                }}
                alternativeDesks={alternativeDesks}
                booking={booking}
                favoriteBusy={favoriteBusy}
                onToggleFavorite={handleToggleFavorite}
                canBookTeam={user?.role === 'team_leader'}
                canReserveRoom={user?.role === 'team_leader' || user?.role === 'manager'}
                showRecurring={showRecurring}
                setShowRecurring={setShowRecurring}
                recurringWeeks={recurringWeeks}
                setRecurringWeeks={setRecurringWeeks}
                reservationMode={reservationMode}
                setReservationMode={setReservationMode}
                roomStartTime={roomStartTime}
                setRoomStartTime={setRoomStartTime}
                roomEndTime={roomEndTime}
                setRoomEndTime={setRoomEndTime}
                message={message}
              />
            </div>
          ) : (
            <div className="sticky top-24 rounded-xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-500">
              Select a seat on the floor plan to view details here.
            </div>
          )}
        </aside>
      </div>

      {selected && detailsOpen && (
        <ResourceDetailsModal
          desk={selected}
          resources={resources}
          selectedDate={date}
          onClose={closeDetails}
          onBook={handleBook}
          onToggleFavorite={handleToggleFavorite}
          favoriteBusy={favoriteBusy}
          booking={booking}
          canReserveTeamLeaderOnly={canReserveResource(selected)}
        />
      )}

      {teamBookingOpen && selected && user?.role === 'team_leader' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Book desks for your team</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Assign a desk to each team member for {format(new Date(date + 'T12:00:00'), 'EEEE, MMM d')}.
                </p>
              </div>
              <button type="button" onClick={closeTeamBooking} className="rounded-full bg-slate-100 px-3 py-2 text-sm">
                Close
              </button>
            </div>

            <div className="mt-5 max-h-[60vh] overflow-auto rounded-2xl border border-slate-200 p-4">
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Repeat this day
                </label>
                <select
                  value={recurringWeeks}
                  onChange={(e) => setRecurringWeeks(Number(e.target.value))}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value={0}>Just this Friday / selected day</option>
                  <option value={1}>Every week for 2 weeks</option>
                  <option value={3}>Every week for 4 weeks</option>
                  <option value={7}>Every week for 8 weeks</option>
                </select>
              </div>
              {teamMembers.length === 0 ? (
                <div className="space-y-3 text-sm text-slate-500">
                  <p>No team members are assigned yet.</p>
                  <Link to="/team" className="font-medium text-brand-600 hover:text-brand-700">
                    Go to My Team to add employees
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[1fr_220px]">
                      <div>
                        <div className="font-semibold text-slate-900">{member.full_name}</div>
                        <div className="text-xs text-slate-500">{member.job_title ?? member.email}</div>
                      </div>
                      <select
                        value={teamAssignments[member.id] ?? ''}
                        onChange={(e) =>
                          setTeamAssignments((prev) => ({
                            ...prev,
                            [member.id]: e.target.value,
                          }))
                        }
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select a desk</option>
                        {resources
                          .filter((r) => r.type === 'desk' && isResourceAvailable(r))
                          .map((resource) => (
                            <option key={resource.id} value={resource.id}>
                              {resource.name} - Floor {resource.floor}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {teamBookingMessage && (
              <p className="mt-4 text-sm text-slate-600">{teamBookingMessage}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeTeamBooking} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTeamBookingSubmit}
                disabled={teamBookingBusy}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {teamBookingBusy ? 'Saving...' : 'Save Team Bookings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecurring && selected && selected.type === 'desk' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-2xl font-bold text-slate-900">Recurring reservation</h3>
            <p className="mt-1 text-sm text-slate-500">
              Repeat this desk every {format(new Date(date + 'T12:00:00'), 'EEEE')} starting{' '}
              {format(new Date(date + 'T12:00:00'), 'EEE, MMM d')}.
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Repeat every selected day for
            </label>
            <select
              value={recurringWeeks}
              onChange={(e) => setRecurringWeeks(Number(e.target.value))}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={0}>Only this {format(new Date(date + 'T12:00:00'), 'EEEE')}</option>
              <option value={1}>2 weeks total</option>
              <option value={3}>4 weeks total</option>
              <option value={7}>8 weeks total</option>
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRecurring(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBook}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
              >
                Save recurring booking
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-900">All Resources</h3>
        </div>
        {resourcesLoading ? (
          <div className="p-4">
            <SkeletonCard rows={5} />
          </div>
        ) : (
        <>
        <div className="divide-y divide-slate-100 p-3 sm:hidden">
          {resources.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => selectResource(r)}
              className="w-full rounded-xl px-3 py-3 text-left transition hover:bg-brand-50/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Floor {r.floor} - {r.zone}
                  </p>
                </div>
                {r.type === 'amenity' ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">Map label</span>
                ) : r.is_mine ? (
                  <span className="badge-blue shrink-0">Mine</span>
                ) : isResourceAvailable(r) ? (
                  <span className="badge-green shrink-0">Available</span>
                ) : (
                  <span className="badge-red shrink-0">Taken</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 capitalize">{r.type}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{r.desk_type ?? 'Standard'}</span>
                {r.restricted_to_team_leaders && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Team leaders only</span>
                )}
                {r.type === 'amenity' && (
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">Map label only</span>
                )}
              </div>
            </button>
          ))}
          {resources.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No resources found for this floor.</p>
          )}
        </div>
        <table className="hidden w-full text-sm sm:table">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Floor</th>
              <th className="px-6 py-3">Zone</th>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3">Desk Type</th>
              <th className="px-6 py-3">Access</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-t border-slate-100 transition hover:bg-brand-50/30"
                onClick={() => selectResource(r)}
              >
                <td className="px-6 py-3.5 font-medium text-slate-900">{r.name}</td>
                <td className="px-6 py-3.5 text-slate-600">{r.floor}</td>
                <td className="px-6 py-3.5 text-slate-600">{r.zone}</td>
                <td className="px-6 py-3.5 capitalize text-slate-600">{r.type}</td>
                <td className="px-6 py-3.5 text-slate-600">{r.desk_type ?? '-'}</td>
                <td className="px-6 py-3.5">
                  {r.restricted_to_team_leaders ? (
                    <span className="badge-amber">Team leaders only</span>
                  ) : (
                    <span className="text-slate-500">Open</span>
                  )}
                </td>
                <td className="px-6 py-3.5">
                  {r.type === 'amenity' ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">Map label</span>
                  ) : r.is_mine ? (
                    <span className="badge-blue">Mine</span>
                  ) : isResourceAvailable(r) ? (
                    <span className="badge-green">Available</span>
                  ) : (
                    <span className="badge-red">Taken</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
        )}
      </div>
    </div>
  );
}
