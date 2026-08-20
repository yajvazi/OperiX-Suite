import { describe, expect, it } from "vitest";
import { bookingCreateSchema } from "./validation";
import { localizedBookingStatus } from "./i18n";

describe("booking shared contracts", () => {
  it("rejects a reservation without a saved or guest customer", () => {
    expect(() => bookingCreateSchema.parse({
      companyId: "00000000-0000-4000-8000-000000000001",
      serviceId: "00000000-0000-4000-8000-000000000002",
      startsAt: "2026-08-20T10:00:00.000Z",
      endsAt: "2026-08-20T11:00:00.000Z",
    })).toThrow();
  });

  it("keeps status labels shared between web and mobile locales", () => {
    expect(localizedBookingStatus("confirmed", "en")).toBe("Confirmed");
    expect(localizedBookingStatus("confirmed", "sq")).toBe("Konfirmuar");
  });
});
