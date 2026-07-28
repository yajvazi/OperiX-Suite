

export default function KpiCard({
  label,
  value,
  suffix = '',
  icon: Icon,
  trend,
  trendUp,
  accent = 'bg-brand-50 text-brand-600',
}) {
  return (
    <div className="card p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {value}
            {suffix && (
              <span className="ml-0.5 text-lg font-semibold text-slate-400">{suffix}</span>
            )}
          </p>
          {trend && (
            <p
              className={`mt-2 text-xs font-medium ${
                trendUp ? 'text-emerald-600' : 'text-slate-500'
              }`}
            >
              {trend}
            </p>
          )}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
          <Icon size={22} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}
