import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";

const webBase = process.env.BOOKING_WEB_BASE_URL;
const mobileBase = process.env.BOOKING_MOBILE_BASE_URL;
const screenshotRoot = path.resolve(process.cwd(), "public/screenshots/booking");

function assertActualCapture(base: string | undefined, label: string) {
  if (process.env.BOOKING_DOCS_CAPTURE_MODE !== "actual") throw new Error("Set BOOKING_DOCS_CAPTURE_MODE=actual; demo-mode screenshots are not permitted.");
  if (!base) return;
  const parsed = new URL(base);
  const allowedHosts = new Set((process.env.BOOKING_DOCS_ALLOWED_HOSTS || "localhost,127.0.0.1,::1").split(",").map((value) => value.trim()).filter(Boolean));
  if (!allowedHosts.has(parsed.hostname)) throw new Error(`${label} capture host ${parsed.hostname} is not allow-listed. Use an isolated non-demo environment.`);
  if (parsed.pathname.toLowerCase().includes("demo") || parsed.hostname.toLowerCase().includes("demo")) throw new Error(`${label} capture target looks like a demo environment.`);
}

function freezeCaptureClock() {
  return `(() => { const FixedDate = class extends Date { constructor(...args) { super(args.length ? args[0] : "2026-08-25T09:00:00.000Z"); } static now() { return new Date("2026-08-25T09:00:00.000Z").getTime(); } }; window.Date = FixedDate; })()`;
}

async function signInWeb(page: Page, base: string) {
  const email = process.env.BOOKING_DOCS_EMAIL;
  const password = process.env.BOOKING_DOCS_PASSWORD;
  if (!email || !password) throw new Error("Set BOOKING_DOCS_EMAIL and BOOKING_DOCS_PASSWORD for the local actual Booking Web capture user.");
  await page.goto(new URL("/dashboard", base).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

async function signInMobile(page: Page, base: string) {
  const email = process.env.BOOKING_DOCS_EMAIL;
  const password = process.env.BOOKING_DOCS_PASSWORD;
  if (!email || !password) throw new Error("Set BOOKING_DOCS_EMAIL and BOOKING_DOCS_PASSWORD for the local actual Booking Mobile capture user.");
  await page.goto(new URL("/", base).toString(), { waitUntil: "commit", timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  const emailInput = page.getByTestId("auth-email-input");
  if (!(await emailInput.isVisible().catch(() => false))) return;
  await emailInput.fill(email);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("auth-sign-in-button").click();
  await page.getByTestId("booking-tab-bookings").waitFor({ state: "visible", timeout: 30_000 });
}

async function capture(page: Page, base: string, route: string, screenshotId: string) {
  assertActualCapture(base, "Booking");
  await page.goto(new URL(route, base).toString(), { waitUntil: "commit", timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  await page.locator(".page-loading").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(screenshotRoot, `${screenshotId}.png`), fullPage: true });
}

async function captureScenarios(page: Page, base: string, scenarios: readonly (readonly [string, string])[]) {
  // A fresh page per scenario keeps the Chromium renderer from accumulating the
  // large Booking route trees during a full visual pass.
  for (const [route, screenshotId] of scenarios) {
    const scenarioPage = await page.context().newPage();
    try {
      await capture(scenarioPage, base, route, screenshotId);
    } finally {
      await scenarioPage.close().catch(() => undefined);
    }
  }
}

type MobilePreparation = (page: Page) => Promise<void>;

async function captureMobileScenario(page: Page, base: string, screenshotId: string, prepare?: MobilePreparation) {
  assertActualCapture(base, "Booking Mobile");
  await signInMobile(page, base);
  await page.goto(new URL('/', base).toString(), { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
  await page.locator('.page-loading').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  if (prepare) await prepare(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(screenshotRoot, `${screenshotId}.png`), fullPage: true });
}

async function captureMobileScenarios(page: Page, base: string, scenarios: readonly { id: string; prepare?: MobilePreparation }[]) {
  for (const scenario of scenarios) {
    const scenarioPage = await page.context().newPage();
    try {
      await captureMobileScenario(scenarioPage, base, scenario.id, scenario.prepare);
    } finally {
      await scenarioPage.close().catch(() => undefined);
    }
  }
}

async function openMobileTab(page: Page, tab: string) {
  await page.getByTestId(`booking-tab-${tab}`).click();
}

async function openMobileMoreItem(page: Page, label: string) {
  await openMobileTab(page, 'more');
  await page.getByText(label, { exact: true }).last().click();
}

async function openMobileDetail(page: Page) {
  await openMobileTab(page, 'bookings');
  await page.locator('button:visible').filter({ hasText: 'Nora Dervishi' }).last().click();
}

test.describe("Booking documentation screenshot flows", () => {
  test("captures deterministic Booking Web screens from the actual local documentation environment", async ({ page }) => {
    test.skip(!webBase, "Set BOOKING_WEB_BASE_URL to capture actual Booking Web screenshots.");
    // A cold Next development server compiles each application route on its
    // first visit. Keep the test deterministic without making CI depend on a
    // warm compiler cache.
    test.setTimeout(300_000);
    fs.mkdirSync(screenshotRoot, { recursive: true });
    assertActualCapture(webBase, "Booking Web");
    await page.context().addInitScript({ content: freezeCaptureClock() });
    await signInWeb(page, webBase!);
    const scenarios = [
      ["/dashboard", "booking-web-dashboard"],
      ["/bookings", "booking-web-bookings-list"],
      ["/bookings/new", "booking-web-create-service"],
      ["/bookings/new", "booking-web-create-time"],
      ["/bookings/90000000-0000-4000-8000-000000000101", "booking-web-detail"],
      ["/calendar", "booking-web-calendar"],
      ["/customers", "booking-web-customers"],
      ["/services", "booking-web-services"],
      ["/staff", "booking-web-staff"],
      ["/resources", "booking-web-resources"],
      ["/settings", "booking-web-settings"],
      ["/bookings/90000000-0000-4000-8000-000000000101", "booking-web-invoice-panel"],
      ["/public/docs-capture", "booking-web-public-page"],
      ["/widget/docs-capture", "booking-web-public-widget"],
      ["/manage/docs-capture-manage-token", "booking-web-customer-portal"],
      ["/waitlist/90000000-0000-4000-8000-000000000291?token=docs-capture-waitlist-token", "booking-web-waitlist-offer"],
    ] as const;
    await captureScenarios(page, webBase!, scenarios);
  });

  test("captures deterministic Booking Mobile screens from the actual local documentation environment", async ({ page }) => {
    test.skip(!mobileBase, "Set BOOKING_MOBILE_BASE_URL to capture actual Booking Mobile screenshots.");
    test.setTimeout(180_000);
    fs.mkdirSync(screenshotRoot, { recursive: true });
    assertActualCapture(mobileBase, "Booking Mobile");
    await page.context().addInitScript({ content: freezeCaptureClock() });
    const scenarios: readonly { id: string; prepare?: MobilePreparation }[] = [
      { id: "booking-mobile-dashboard" },
      { id: "booking-mobile-bookings-list", prepare: (current) => openMobileTab(current, 'bookings') },
      { id: "booking-mobile-create-service", prepare: (current) => current.getByTestId('dashboard-quick-booking').click() },
      { id: "booking-mobile-create-time", prepare: async (current) => { await current.getByTestId('dashboard-quick-booking').click(); await current.getByRole('button', { name: /Strategy session.*60 min/ }).click(); await current.getByRole('button', { name: 'Next', exact: true }).click(); await current.getByRole('button', { name: /Nora Dervishi.*nora@fictional.invalid/ }).click(); await current.getByRole('button', { name: 'Next', exact: true }).click(); } },
      { id: "booking-mobile-recurring", prepare: async (current) => { await current.getByTestId('dashboard-quick-booking').click(); await current.getByRole('button', { name: /Strategy session.*60 min/ }).click(); await current.getByRole('button', { name: 'Next', exact: true }).click(); await current.getByRole('button', { name: /Nora Dervishi.*nora@fictional.invalid/ }).click(); await current.getByRole('button', { name: 'Next', exact: true }).click(); await current.getByRole('button', { name: /Check availability/i }).click(); await current.locator('button:visible').filter({ hasText: /09:00|10:00|11:00|AM|PM/ }).first().click(); await current.getByRole('button', { name: 'Review', exact: true }).click(); await current.getByLabel('Recurring booking').click(); } },
      { id: "booking-mobile-detail", prepare: (current) => openMobileDetail(current) },
      { id: "booking-mobile-calendar", prepare: (current) => openMobileTab(current, 'calendar') },
      { id: "booking-mobile-customers", prepare: (current) => openMobileTab(current, 'customers') },
      { id: "booking-mobile-services", prepare: (current) => openMobileMoreItem(current, 'Services') },
      { id: "booking-mobile-staff", prepare: (current) => openMobileMoreItem(current, 'Staff') },
      { id: "booking-mobile-resources", prepare: (current) => openMobileMoreItem(current, 'Resources') },
      { id: "booking-mobile-locations", prepare: (current) => openMobileMoreItem(current, 'Locations') },
      { id: "booking-mobile-availability", prepare: (current) => current.getByTestId('dashboard-quick-block-time').click() },
      { id: "booking-mobile-working-hours", prepare: async (current) => { await openMobileMoreItem(current, 'Business settings'); await current.getByText('Availability', { exact: true }).last().click(); } },
      { id: "booking-mobile-blocked-time", prepare: (current) => current.getByTestId('dashboard-quick-block-time').click() },
      { id: "booking-mobile-settings", prepare: (current) => openMobileMoreItem(current, 'Business settings') },
      { id: "booking-mobile-public-settings", prepare: (current) => openMobileMoreItem(current, 'Booking Page') },
      { id: "booking-mobile-calendar-sync", prepare: (current) => openMobileMoreItem(current, 'Calendar sync') },
      { id: "booking-mobile-packages", prepare: (current) => openMobileMoreItem(current, 'Platform features') },
      { id: "booking-mobile-memberships", prepare: async (current) => { await openMobileMoreItem(current, 'Platform features'); await current.getByRole('button', { name: 'Memberships', exact: true }).click(); } },
      { id: "booking-mobile-automations", prepare: async (current) => { await openMobileMoreItem(current, 'Platform features'); await current.getByRole('button', { name: 'Automations', exact: true }).click(); } },
      { id: "booking-mobile-check-in", prepare: (current) => openMobileDetail(current) },
      { id: "booking-mobile-payments", prepare: (current) => openMobileMoreItem(current, 'Payments') },
      { id: "booking-mobile-notifications", prepare: (current) => openMobileMoreItem(current, 'Notifications') },
      { id: "booking-mobile-reports", prepare: (current) => openMobileMoreItem(current, 'Reports') },
      { id: "booking-mobile-subscription", prepare: (current) => openMobileMoreItem(current, 'Subscription & billing') },
      { id: "booking-mobile-invoice-action", prepare: (current) => openMobileDetail(current) },
      { id: "booking-mobile-waitlist", prepare: (current) => openMobileMoreItem(current, 'Waiting list') },
    ];
    await captureMobileScenarios(page, mobileBase!, scenarios);
  });
});
