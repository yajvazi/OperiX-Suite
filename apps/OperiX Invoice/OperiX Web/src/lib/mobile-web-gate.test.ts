import { describe, expect, it } from "vitest";
import { isMobileWebRouteAllowed, isPhoneSizedWebDevice, PHONE_WEB_BREAKPOINT } from "./mobile-web-gate";

describe("Invoice Web phone gate detection", () => {
  it("allows desktop and laptop viewports", () => {
    expect(isPhoneSizedWebDevice({ width: 1440, height: 900 })).toBe(false);
    expect(isPhoneSizedWebDevice({ width: 1280, height: 800 })).toBe(false);
  });

  it("allows tablets and iPad, including landscape tablets", () => {
    expect(isPhoneSizedWebDevice({ width: 1024, height: 1366, coarsePointer: true, maxTouchPoints: 5, userAgent: "Android tablet" })).toBe(false);
    expect(isPhoneSizedWebDevice({ width: 768, height: 1024, coarsePointer: true, maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" })).toBe(false);
    expect(isPhoneSizedWebDevice({ width: 1366, height: 1024, coarsePointer: true, maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" })).toBe(false);
    expect(PHONE_WEB_BREAKPOINT).toBe(767);
  });

  it("gates iPhone and Android phone viewports", () => {
    expect(isPhoneSizedWebDevice({ width: 390, height: 844, coarsePointer: true, maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe(true);
    expect(isPhoneSizedWebDevice({ width: 412, height: 915, coarsePointer: true, maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36" })).toBe(true);
    expect(isPhoneSizedWebDevice({ width: 844, height: 390, coarsePointer: true, maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe(true);
  });

  it("responds to a desktop browser being resized to phone width and back", () => {
    expect(isPhoneSizedWebDevice({ width: 600, height: 900, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(true);
    expect(isPhoneSizedWebDevice({ width: 1280, height: 900, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(false);
  });
});

describe("Invoice Web phone route allowlist", () => {
  it.each(["/login", "/auth/callback", "/auth/reset", "/portal/invoice/abc", "/qr/abc", "/open/invoices/abc", "/privacy", "/terms", "/support", "/billing/success"])('allows public route %s', (pathname) => {
    expect(isMobileWebRouteAllowed(pathname)).toBe(true);
  });

  it.each(["/dashboard", "/invoices", "/invoices/abc", "/settings", "/portalx/abc"])('gates authenticated route %s', (pathname) => {
    expect(isMobileWebRouteAllowed(pathname)).toBe(false);
  });
});
