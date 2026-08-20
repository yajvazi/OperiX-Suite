export const SALES_BOOK_TIMEZONE = "Europe/Belgrade";

export type SalesBookReportingFrequency = "monthly" | "quarterly" | "annual";
export type SalesBookStatus =
  | "OPEN"
  | "READY_FOR_DECLARATION"
  | "DECLARED"
  | "AMENDED";

export interface SalesBookTaxSettings {
  vatRegistrationStatus?: string | null;
  reportingFrequency?: string | null;
  timezone?: string | null;
}

export interface SalesBookStrategy {
  enabled: boolean;
  frequency: SalesBookReportingFrequency | null;
  timezone: string;
  requiresConfiguration: boolean;
  configurationMessage?: string;
}

export interface SalesBookPeriodDates {
  periodStart: string;
  periodEnd: string;
  declarationDeadline: string;
  reportingFrequency: SalesBookReportingFrequency;
  timezone: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function assertIsoDate(value: string) {
  if (!ISO_DATE.test(value)) throw new Error(`Invalid business date: ${value}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid business date: ${value}`);
  }
  return value;
}

/**
 * Invoice issue dates are stored as calendar dates and must not be converted
 * through UTC. Datetimes are only converted when a source actually includes a
 * time component, using the tenant's established Kosovo business timezone.
 */
export function normalizeBusinessDate(
  value: string | Date,
  timezone = SALES_BOOK_TIMEZONE,
) {
  if (typeof value === "string" && ISO_DATE.test(value)) {
    return assertIsoDate(value);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid business date: ${String(value)}`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return assertIsoDate(isoDate(year, month, day));
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function addMonths(year: number, month: number, months: number) {
  const total = year * 12 + (month - 1) + months;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function resolveSalesBookStrategy(
  settings: SalesBookTaxSettings,
): SalesBookStrategy {
  const timezone = settings.timezone?.trim() || SALES_BOOK_TIMEZONE;
  const rawFrequency = settings.reportingFrequency?.trim().toLowerCase();
  if (!rawFrequency) {
    return {
      enabled: false,
      frequency: null,
      timezone,
      requiresConfiguration: true,
      configurationMessage: "VAT reporting frequency is not configured.",
    };
  }
  if (!(["monthly", "quarterly", "annual"] as string[]).includes(rawFrequency)) {
    return {
      enabled: false,
      frequency: null,
      timezone,
      requiresConfiguration: true,
      configurationMessage: `VAT reporting frequency is not supported: ${rawFrequency}.`,
    };
  }
  return {
    enabled: true,
    frequency: rawFrequency as SalesBookReportingFrequency,
    timezone,
    requiresConfiguration: false,
  };
}

export function getSalesBookPeriod(
  transactionDate: string | Date,
  settings: SalesBookTaxSettings,
): SalesBookPeriodDates | null {
  const strategy = resolveSalesBookStrategy(settings);
  if (strategy.requiresConfiguration) throw new Error(strategy.configurationMessage);
  if (!strategy.enabled || !strategy.frequency) return null;

  const businessDate = normalizeBusinessDate(transactionDate, strategy.timezone);
  const [year, month] = businessDate.split("-").map(Number);
  let startYear = year;
  let startMonth = month;
  let periodMonths = 1;
  if (strategy.frequency === "quarterly") {
    startMonth = Math.floor((month - 1) / 3) * 3 + 1;
    periodMonths = 3;
  } else if (strategy.frequency === "annual") {
    startMonth = 1;
    periodMonths = 12;
  }

  const endMonth = addMonths(startYear, startMonth, periodMonths - 1);
  const deadlineMonth = nextMonth(endMonth.year, endMonth.month);
  const declarationDeadline = strategy.frequency === "annual"
    ? isoDate(endMonth.year + 1, 3, 31)
    : isoDate(deadlineMonth.year, deadlineMonth.month, 20);

  return {
    periodStart: isoDate(startYear, startMonth, 1),
    periodEnd: isoDate(endMonth.year, endMonth.month, lastDayOfMonth(endMonth.year, endMonth.month)),
    declarationDeadline,
    reportingFrequency: strategy.frequency,
    timezone: strategy.timezone,
  };
}

export function salesBookPeriodKey(period: Pick<SalesBookPeriodDates, "periodStart" | "periodEnd">) {
  return `${period.periodStart}:${period.periodEnd}`;
}

export function isSalesBookPeriodLocked(status: SalesBookStatus | string) {
  return status === "DECLARED" || status === "AMENDED";
}

export function canTransitionSalesBookStatus(
  current: SalesBookStatus,
  next: SalesBookStatus,
) {
  if (current === "OPEN") return next === "OPEN" || next === "READY_FOR_DECLARATION";
  if (current === "READY_FOR_DECLARATION") return next === "READY_FOR_DECLARATION" || next === "DECLARED";
  if (current === "DECLARED") return next === "DECLARED" || next === "AMENDED";
  return next === "AMENDED";
}
