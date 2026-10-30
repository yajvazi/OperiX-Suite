import { describe, expect, it } from "vitest";
import { encodeQr, qrSvg } from "./qr";

describe("qr", () => {
  it("picks sizes by length and is deterministic", () => {
    expect(encodeQr("https://a.io").length).toBe(21);
    expect(encodeQr("https://x.co/" + "a".repeat(60)).length).toBe(37);
    expect(encodeQr("hello")).toEqual(encodeQr("hello"));
  });
  it("draws the three finder patterns and rejects oversized input", () => {
    const m = encodeQr("https://a.io");
    expect([m[0][0], m[0][20], m[20][0], m[3][3]]).toEqual([true, true, true, true]);
    expect(() => encodeQr("x".repeat(200))).toThrow();
    expect(qrSvg("https://a.io")).toContain("<svg");
  });
});
