import { describe, expect, it } from "vitest";
import { calculateRetryAt } from "./queue";

describe("email queue retry policy", () => {
  it("uses exponential backoff and caps at six hours", () => {
    const now = Date.parse("2026-08-06T12:00:00.000Z");
    expect(calculateRetryAt(1, now)).toBe("2026-08-06T12:00:30.000Z");
    expect(calculateRetryAt(3, now)).toBe("2026-08-06T12:02:00.000Z");
    expect(calculateRetryAt(20, now)).toBe("2026-08-06T18:00:00.000Z");
  });
});
