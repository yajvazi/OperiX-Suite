import { describe, expect, it } from "vitest";
import { buildAvailabilitySlots, calculateBookingTotals, canTransitionBookingStatus, isTimeConflict } from "./business";

describe("booking business rules", () => {
  it("calculates discount, tax, total, and deposit from one contract", () => {
    expect(calculateBookingTotals({ unitPrice: 100, quantity: 2, discountPercent: 10, taxRate: 18, depositType: "percentage", depositValue: 25 })).toEqual({ subtotal: 200, discount: 20, taxable: 180, tax: 32.4, deposit: 53.1, total: 212.4 });
  });

  it("enforces the central status transition graph", () => {
    expect(canTransitionBookingStatus("confirmed", "checked_in")).toBe(true);
    expect(canTransitionBookingStatus("completed", "confirmed")).toBe(false);
  });

  it("detects overlapping reservations with buffers", () => {
    expect(isTimeConflict({ startsAt: "2026-08-13T10:00:00Z", endsAt: "2026-08-13T11:00:00Z" }, { startsAt: "2026-08-13T11:10:00Z", endsAt: "2026-08-13T12:00:00Z" }, 0, 15)).toBe(true);
  });

  it("generates slots and excludes blocked and booked intervals", () => {
    const slots = buildAvailabilitySlots({
      date: "2026-08-13",
      timezone: "UTC",
      durationMinutes: 60,
      intervalMinutes: 60,
      workingIntervals: [{ startsAt: "2026-08-13T09:00:00Z", endsAt: "2026-08-13T12:00:00Z" }],
      blockedIntervals: [{ startsAt: "2026-08-13T10:00:00Z", endsAt: "2026-08-13T11:00:00Z" }],
      now: new Date("2026-08-12T00:00:00Z"),
    });
    expect(slots).toHaveLength(3);
    expect(slots[0].available).toBe(true);
    expect(slots[1].available).toBe(false);
    expect(slots[2].available).toBe(true);
  });
});
