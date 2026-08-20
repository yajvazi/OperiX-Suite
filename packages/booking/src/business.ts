import type { AvailabilitySlot, BookingStatus } from "./types";

export const ACTIVE_CONFLICT_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
  "in_progress",
  "rescheduled",
];

export const STATUS_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled", "rescheduled"],
  confirmed: ["checked_in", "cancelled", "no_show", "rescheduled"],
  checked_in: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: ["confirmed", "cancelled"],
};

export function canTransitionBookingStatus(from: BookingStatus, to: BookingStatus): boolean {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100 + Number.EPSILON) / 100;
}

export interface BookingTotalsInput {
  unitPrice: number;
  quantity?: number;
  discountAmount?: number;
  discountPercent?: number;
  taxRate?: number;
  depositType?: "none" | "fixed" | "percentage";
  depositValue?: number;
}

export interface BookingTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  deposit: number;
  total: number;
}

export function calculateBookingTotals(input: BookingTotalsInput): BookingTotals {
  const quantity = Math.max(1, Number(input.quantity || 1));
  const subtotal = roundMoney(Math.max(0, Number(input.unitPrice || 0)) * quantity);
  const requestedDiscount = input.discountAmount !== undefined
    ? Math.max(0, Number(input.discountAmount) || 0)
    : subtotal * Math.min(100, Math.max(0, Number(input.discountPercent || 0))) / 100;
  const discount = roundMoney(Math.min(subtotal, requestedDiscount));
  const taxable = roundMoney(Math.max(0, subtotal - discount));
  const tax = roundMoney(taxable * Math.min(100, Math.max(0, Number(input.taxRate || 0))) / 100);
  const total = roundMoney(taxable + tax);
  const depositBase = input.depositType === "percentage"
    ? total * Math.min(100, Math.max(0, Number(input.depositValue || 0))) / 100
    : input.depositType === "fixed"
      ? Math.max(0, Number(input.depositValue || 0))
      : 0;
  return { subtotal, discount, taxable, tax, deposit: roundMoney(Math.min(total, depositBase)), total };
}

export interface AvailabilityInterval {
  startsAt: string;
  endsAt: string;
}

function overlaps(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function isTimeConflict(
  candidate: AvailabilityInterval,
  existing: AvailabilityInterval,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
): boolean {
  const start = new Date(candidate.startsAt).getTime() - bufferBeforeMinutes * 60_000;
  const end = new Date(candidate.endsAt).getTime() + bufferAfterMinutes * 60_000;
  return overlaps(start, end, new Date(existing.startsAt).getTime(), new Date(existing.endsAt).getTime());
}

export interface AvailabilityBuildInput {
  date: string;
  timezone: string;
  durationMinutes: number;
  intervalMinutes?: number;
  workingIntervals: AvailabilityInterval[];
  blockedIntervals?: AvailabilityInterval[];
  bookedIntervals?: AvailabilityInterval[];
  minimumNoticeMinutes?: number;
  now?: Date;
}

/**
 * Pure slot generation used by clients for rendering and by tests. The
 * database RPC remains authoritative for writes and for public availability.
 */
export function buildAvailabilitySlots(input: AvailabilityBuildInput): AvailabilitySlot[] {
  const interval = Math.max(5, input.intervalMinutes || 15);
  const noticeAt = (input.now || new Date()).getTime() + Math.max(0, input.minimumNoticeMinutes || 0) * 60_000;
  const blocked = input.blockedIntervals || [];
  const booked = input.bookedIntervals || [];
  const slots: AvailabilitySlot[] = [];
  for (const window of input.workingIntervals) {
    const windowStart = new Date(window.startsAt).getTime();
    const windowEnd = new Date(window.endsAt).getTime();
    for (let cursor = windowStart; cursor + input.durationMinutes * 60_000 <= windowEnd; cursor += interval * 60_000) {
      const startsAt = new Date(cursor).toISOString();
      const endsAt = new Date(cursor + input.durationMinutes * 60_000).toISOString();
      const unavailable = cursor < noticeAt
        || blocked.some((item) => isTimeConflict({ startsAt, endsAt }, item))
        || booked.some((item) => isTimeConflict({ startsAt, endsAt }, item));
      slots.push({ startsAt, endsAt, available: !unavailable });
    }
  }
  return slots;
}

export function bookingStatusLabel(status: BookingStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function bookingStatusTone(status: BookingStatus): "blue" | "green" | "amber" | "red" | "gray" {
  if (["confirmed", "checked_in", "in_progress", "rescheduled"].includes(status)) return "blue";
  if (status === "completed") return "green";
  if (status === "pending") return "amber";
  if (["cancelled", "no_show"].includes(status)) return "red";
  return "gray";
}
