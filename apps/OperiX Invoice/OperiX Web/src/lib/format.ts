export function money(value: unknown, currency = "EUR") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}
export function shortDate(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(String(value)));
}
export function isoToday() { return new Date().toISOString().slice(0, 10); }
export function addDays(date: string, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); }
export function statusClass(status: unknown) { return `status status-${String(status || "draft").toLowerCase()}`; }
