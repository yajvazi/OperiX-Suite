import { Armchair } from 'lucide-react';

export default function BrandMark({
  className = '',
  size = 40,
  showWordmark = false,
  darkText = false,
}) {
  return (
    <div className={`inline-flex items-center gap-[9px] ${className}`} aria-label="OperiX Desk">
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-[9px] bg-brand-600 text-white shadow-[0_5px_12px_rgba(0,79,254,0.2)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Armchair size={Math.max(15, Math.round(size * 0.46))} strokeWidth={2.1} />
      </div>
      {showWordmark && (
        <div className="leading-tight">
          <div className={`text-[14px] tracking-[-0.025em] ${darkText ? 'text-slate-900' : 'text-white'}`}>
            <span className="font-bold">OperiX</span>{' '}<span className={darkText ? 'text-slate-900 font-normal' : 'text-brand-200 font-normal'}>Desk</span>
          </div>
        </div>
      )}
    </div>
  );
}
