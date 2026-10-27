import { afterEach, describe, expect, it, vi } from "vitest";

async function loadNavigation() {
  vi.resetModules();
  return import("./navigation");
}

describe("POS feature flag", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("is off by default and hides POS from every navigation list", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_ENABLED", "");
    const { POS_ENABLED } = await import("./features");
    const nav = await loadNavigation();
    expect(POS_ENABLED).toBe(false);
    expect(nav.primaryNavigation.some((item) => item.href === "/pos")).toBe(false);
    expect(nav.mobileNavigation.some((item) => item.href === "/pos")).toBe(false);
  });

  it("shows POS only when NEXT_PUBLIC_POS_ENABLED is exactly true", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_ENABLED", "true");
    vi.resetModules();
    const { POS_ENABLED } = await import("./features");
    const nav = await loadNavigation();
    expect(POS_ENABLED).toBe(true);
    expect(nav.primaryNavigation.some((item) => item.href === "/pos")).toBe(true);
    expect(nav.mobileNavigation.some((item) => item.href === "/pos")).toBe(true);
  });

  it("does not enable POS for other truthy-looking values", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_ENABLED", "1");
    const { POS_ENABLED } = await import("./features");
    expect(POS_ENABLED).toBe(false);
  });
});

describe("app base URL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("has no hosted default and trims trailing slashes", async () => {
    vi.stubEnv("NEXT_PUBLIC_INVOICE_APP_URL", "");
    const { appBaseUrl } = await import("./app-config");
    expect(appBaseUrl()).toBe("");
    vi.stubEnv("NEXT_PUBLIC_INVOICE_APP_URL", " https://invoice.example.com/// ");
    expect(appBaseUrl()).toBe("https://invoice.example.com");
  });
});
