export function formatApiError(error, fallback = 'Something went wrong.') {
  const detail = error?.response?.data?.detail;

  if (!detail) {
    return error?.message || fallback;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.msg) return String(item.msg).replace(/^Value error,\s*/i, '');
        return null;
      })
      .filter(Boolean)
      .join(' ')
      || fallback;
  }

  if (typeof detail === 'object' && detail.msg) {
    return String(detail.msg);
  }

  return fallback;
}
