import {
  ArrowLeft,
  Coffee,
  Heart,
  Info,
  MapPin,
  Monitor,
  MoveLeft,
  Star,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { DESK_IMAGES } from '../lib/constants';
import { isResourceAvailable, isResourceReservedByOther } from '../lib/desks';

const DETAIL_AMENITIES = {
  'Window View': { icon: MapPin, copy: 'Great natural light and city view' },
  'Near window': { icon: MapPin, copy: 'Placed close to windows for better natural light' },
  'Dual Monitors': { icon: Monitor, copy: '27" monitors with docking station' },
  'Dual monitors': { icon: Monitor, copy: 'Dual-screen setup for multitasking' },
  'Ergonomic Chair': { icon: Users, copy: 'Premium adjustable chair' },
  'Ergonomic chair': { icon: Users, copy: 'Comfortable ergonomic seating for long work sessions' },
  'Standing Desk': { icon: MoveLeft, copy: 'Height adjustable desk' },
  'Standing desk': { icon: MoveLeft, copy: 'Switch easily between sitting and standing' },
  'Power & USB': { icon: Tv, copy: 'Multiple power and USB outlets' },
  'Charging station': { icon: Tv, copy: 'Easy access to power for laptops and phones' },
  'Docking station': { icon: Monitor, copy: 'Connect quickly to shared monitors and peripherals' },
  'Near Coffee Bar': { icon: Coffee, copy: '1 min walk to coffee bar' },
  'Near coffee bar': { icon: Coffee, copy: 'Quick access to coffee and break areas' },
  'Quiet zone': { icon: Info, copy: 'Good for focused work with fewer distractions' },
  'Near team': { icon: Users, copy: 'Convenient for sitting close to teammates' },
  'Phone booth nearby': { icon: Info, copy: 'Private call space is close by when needed' },
};

function getLabelForType(type) {
  if (type === 'room') return 'Meeting Room';
  if (type === 'amenity') return 'Amenity';
  return 'Desk';
}

export default function ResourceDetailsModal({
  desk,
  selectedDate,
  onClose,
  onBook,
  onToggleFavorite,
  favoriteBusy,
  booking,
  canReserveTeamLeaderOnly = true,
}) {
  const image =
    DESK_IMAGES[desk.desk_type ?? ''] ?? DESK_IMAGES.default;
  const amenities = desk.amenities?.split(',').map((a) => a.trim()).filter(Boolean) ?? [];
  const bestFor = desk.type === 'room'
    ? 'Team meetings, client calls'
    : desk.zone === 'Quiet Zone'
      ? 'Focus work, individual tasks'
      : 'Collaboration, hybrid workdays';
  const isTeamLeaderOnly = Boolean(desk.restricted_to_team_leaders);
  const isAmenity = desk.type === 'amenity';
  const isReservedConflict = desk.type !== 'room' && isResourceReservedByOther(desk);

  const nextAvailable = useMemo(() => {
    if (isResourceAvailable(desk)) {
      return { day: 'Available today', time: 'Now' };
    }
    const baseDate = selectedDate ? parseISO(selectedDate) : new Date();
    return {
      day: format(addDays(baseDate, 1), 'EEEE, MMM d'),
      time: '08:00 AM',
    };
  }, [desk.is_available, selectedDate]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overscroll-contain bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="h-[100dvh] w-full overflow-y-auto overscroll-contain bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-2xl lg:grid lg:h-[90vh] lg:grid-cols-[1.1fr_0.9fr] lg:overflow-hidden">
        <div className="relative z-0 min-h-0 border-b border-slate-200 bg-slate-50 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4 lg:static lg:bg-transparent">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft size={16} className="shrink-0" />
              <span className="truncate">Back to floor plan</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white p-2 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <img
              src={image}
              alt={desk.name}
              className="h-48 w-full rounded-xl border border-slate-200 object-cover sm:h-64 lg:h-[420px]"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-h-[84px] rounded-xl border border-slate-200 bg-white p-4 sm:p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Location</div>
                <div className="mt-1 break-words font-semibold text-slate-900">{desk.building ?? 'HQ - Prishtina'}</div>
                <div className="break-words text-sm text-slate-500">{desk.zone}</div>
              </div>
              <div className="min-h-[84px] rounded-xl border border-slate-200 bg-white p-4 sm:p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Floor</div>
                <div className="mt-1 break-words font-semibold text-slate-900">Floor {desk.floor}</div>
                <div className="break-words text-sm text-slate-500">{getLabelForType(desk.type)}</div>
              </div>
              <div className="min-h-[84px] rounded-xl border border-slate-200 bg-white p-4 sm:p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Capacity</div>
                <div className="mt-1 break-words font-semibold text-slate-900">
                  {desk.capacity} {desk.capacity === 1 ? 'person' : 'people'}
                </div>
                <div className="break-words text-sm text-slate-500">{bestFor}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex min-h-0 flex-col border-t border-slate-200 bg-white p-5 pt-6 sm:p-6 lg:overflow-y-auto lg:overscroll-contain lg:border-t-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">{desk.desk_type ?? getLabelForType(desk.type)}</p>
              <h2 className="break-words text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{desk.name}</h2>
            </div>
            {isAmenity ? (
              <span className="self-start shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                Map label only
              </span>
            ) : (
              <span className={`${isResourceAvailable(desk) ? 'badge-green' : 'badge-red'} self-start shrink-0 whitespace-nowrap`}>
                {isResourceAvailable(desk) ? 'Available' : 'Reserved'}
              </span>
            )}
            {isTeamLeaderOnly && (
              <span className="badge-amber self-start shrink-0 whitespace-nowrap">
                Team leaders only
              </span>
            )}
          </div>

          {isTeamLeaderOnly && !canReserveTeamLeaderOnly && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              This resource can only be reserved by team leaders. Ask your team leader to assign it to you.
            </div>
          )}
          {isAmenity && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              This is an amenity marker for wayfinding only. It cannot be reserved.
            </div>
          )}

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Next available</div>
            <div className="mt-2 grid gap-1 text-sm sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
              <span className="break-words text-brand-600">{nextAvailable.day}</span>
              <span className="shrink-0 font-semibold text-slate-900">{nextAvailable.time}</span>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold text-slate-900">Amenities</h3>
            <div className="mt-3 space-y-3">
              {amenities.length > 0 ? amenities.map((amenity) => {
                const meta = DETAIL_AMENITIES[amenity];
                const Icon = meta?.icon ?? Info;
                return (
                  <div key={amenity} className="flex gap-3 rounded-xl border border-slate-200 p-4 sm:p-3">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 p-2 text-slate-600">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{amenity}</div>
                      <div className="text-sm text-slate-500">
                        {meta?.copy ?? 'Configured for everyday office work'}
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <p className="text-sm text-slate-500">No amenities listed yet for this resource.</p>
              )}
            </div>
          </div>

          {desk.type === 'desk' && (
            <div className="mt-5">
              <span className="badge-blue text-sm">
                <Star size={12} className="mr-1" />
                2D floor plan pin
              </span>
            </div>
          )}

          <div className="mt-auto space-y-3 pt-6">
            <button
              type="button"
              onClick={onBook}
              disabled={booking || isAmenity || isReservedConflict || desk.is_mine || !canReserveTeamLeaderOnly}
              className="btn-primary w-full py-3"
            >
              {isAmenity ? 'Cannot be reserved' : booking ? 'Reserving...' : 'Reserve now'}
            </button>
            <button
              type="button"
              onClick={onToggleFavorite}
              disabled={favoriteBusy}
              className="btn-secondary w-full py-3"
            >
              <Heart size={18} fill={desk.is_favorite ? 'currentColor' : 'none'} />
              {desk.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
