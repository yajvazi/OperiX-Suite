export default function BrandMark({
  className = '',
  size = 40,
  showWordmark = false,
  darkText = false,
}) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-brand-600 text-white shadow-lg ring-1 ring-white/10"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" className="h-full w-full">
          <defs>
            <linearGradient id="deskdibsMark" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#2684ff" />
              <stop offset="100%" stopColor="#0052cc" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="64" height="64" rx="18" fill="url(#deskdibsMark)" />
          <path
            d="M17 18h18c7.7 0 14 6.3 14 14s-6.3 14-14 14H17V18Zm8 8v12h10c3.3 0 6-2.7 6-6s-2.7-6-6-6H25Z"
            fill="#ffffff"
            opacity="0.96"
          />
          <path
            d="M27 31h15a7 7 0 0 1 7 7v3H31a7 7 0 0 1-7-7v0a3 3 0 0 1 3-3Z"
            fill="#bfdbfe"
          />
          <path
            d="M29 46v5M45 46v5M18 51h35"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="48" cy="17" r="7" fill="#ffffff" />
          <path d="M45 17.2l2.1 2.1 4-4.5" fill="none" stroke="#0052cc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {showWordmark && (
        <div className="leading-tight">
          <div className={`text-lg font-bold tracking-tight ${darkText ? 'text-slate-900' : 'text-white'}`}>
            DeskDibs
          </div>
          <div className={darkText ? 'text-[11px] text-slate-500' : 'text-[11px] text-brand-200'}>
            Reserve desks and seats
          </div>
        </div>
      )}
    </div>
  );
}
