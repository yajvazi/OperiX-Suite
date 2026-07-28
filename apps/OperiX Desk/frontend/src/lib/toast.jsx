import { toast } from 'react-toastify';

export function showConfirmToast({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
}) {
  const toastId = toast.warn(
    ({ closeToast }) => (
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-800">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={closeToast}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(toastId);
              onConfirm();
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    ),
    {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
    },
  );
}
