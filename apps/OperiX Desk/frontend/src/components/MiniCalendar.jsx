import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';


export default function MiniCalendar({
  highlightedDates,
  selectedDate,
  onSelectDate,
}) {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });

  const highlighted = highlightedDates.map((d) => parseISO(d));

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold text-slate-900">{format(today, 'MMMM yyyy')}</h4>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="py-1 font-medium text-slate-400">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const hasBooking = highlighted.some((d) => isSameDay(d, day));
          const isSelected = selectedDate && isSameDay(day, parseISO(selectedDate));
          const inMonth = isSameMonth(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!onSelectDate}
              onClick={() => onSelectDate?.(format(day, 'yyyy-MM-dd'))}
              className={`relative rounded-lg py-1.5 text-sm transition ${
                !inMonth ? 'text-slate-300' : 'text-slate-700'
              } ${isSelected ? 'bg-brand-600 font-semibold text-white' : ''} ${
                hasBooking && !isSelected ? 'bg-brand-50 font-medium text-brand-700' : ''
              } ${onSelectDate && inMonth ? 'hover:bg-slate-100' : ''}`}
            >
              {format(day, 'd')}
              {hasBooking && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
