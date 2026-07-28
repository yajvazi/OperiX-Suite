export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

export function SkeletonCard({ rows = 3, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <SkeletonBlock className="h-4 w-2/5" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBlock key={index} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
        <SkeletonBlock className="h-4 w-40" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid gap-4 px-6 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <SkeletonBlock key={columnIndex} className="h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
