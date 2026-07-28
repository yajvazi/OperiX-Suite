export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const isDanger = variant === 'danger';
  const confirmClass =
    isDanger
      ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-600/20'
      : 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-600/20';
  const iconClass = isDanger
    ? 'bg-red-50 text-red-600 ring-red-100'
    : 'bg-brand-50 text-brand-700 ring-brand-100';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${iconClass}`}>
              {isDanger ? '!' : '?'}
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-4 disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
