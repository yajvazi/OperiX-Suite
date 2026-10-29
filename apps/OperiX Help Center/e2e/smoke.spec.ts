import { expect, test } from "@playwright/test";

test("homepage and search are usable", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/How can we help/);
  await expect(page.getByRole("heading", { name: "How can we help?" })).toBeVisible();
  await page.getByRole("search").getByPlaceholder("Search documentation...").fill("invoice");
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/en\/search\?q=invoice/);
  await expect(page.getByRole("heading", { name: /Search results for/ })).toBeVisible();
});

test("language fallback and not-found routes are clear", async ({ page }, testInfo) => {
  await page.goto("/en/help/invoice/invoices/create-invoice");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Shqip" })).toHaveAttribute("href", "/sq/help/invoice/invoices/create-invoice");
  const missing = await page.goto("/en/help/invoice/invoices/not-an-article");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /couldn.t find that article/i })).toBeVisible();
});

test("article layout, feedback, and mobile navigation render", async ({ page }) => {
  await page.goto("/en/help/invoice/invoices/create-invoice");
  await expect(page.getByRole("heading", { name: "Create an Invoice", exact: true })).toBeVisible();
  await expect(page.getByText("Screenshot placeholder")).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByText("Thanks for helping us improve the docs.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Documentation", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Documentation navigation" })).toBeVisible();
});

test("mobile site navigation uses a full-height drawer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "This regression applies to the mobile site menu.");
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();

  const overlay = page.locator(".mobile-site-overlay");
  await expect(overlay).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();

  const geometry = await overlay.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { parent: element.parentElement?.tagName, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  });
  expect(geometry.parent).toBe("BODY");
  expect(geometry.width).toBe(geometry.viewportWidth);
  expect(geometry.height).toBe(geometry.viewportHeight);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Documentation", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(overlay).toHaveCount(0);
});

test("health endpoint is safe", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ status: "ok", service: "operix-help-center" });
});

test("Browse by Product separates public and Enterprise products", async ({ page }) => {
  await page.goto("/en");
  const browse = page.locator(".browse-section");
  await expect(browse.getByRole("heading", { name: "Browse by Product", exact: true })).toBeVisible();
  await expect(browse.getByRole("heading", { name: "Enterprise Products", exact: true })).toBeVisible();

  const cards = browse.locator(".product-card");
  await expect(cards).toHaveCount(6);
  expect(await cards.evaluateAll((items) => items.map((item) => item.querySelector("strong")?.textContent?.trim()))).toEqual([
    "OperiX Invoice",
    "OperiX Booking",
    "OperiX Suite",
    "OperiX HR",
    "OperiX Desk",
    "OperiX Control",
  ]);
  await expect(cards.nth(0)).toHaveAttribute("href", "/en/help/invoice");
  await expect(cards.nth(1)).toHaveAttribute("href", "/en/help/booking");
  await expect(cards.nth(2)).toHaveAttribute("href", "/en/help/suite");
  await expect(cards.nth(0).locator(".product-arrow")).toBeVisible();
  await expect(cards.nth(3).locator(".enterprise-badge")).toHaveText("Enterprise product");
  await expect(cards.nth(3).locator(".product-lock")).toBeVisible();
  await expect(cards.nth(5)).toHaveAttribute("aria-label", "OperiX Control, Enterprise product");
});

test("Enterprise documentation remains locked through direct URLs and search", async ({ page }) => {
  await page.goto("/en/help/hr/getting-started/about-operix-hr");
  await expect(page).toHaveURL(/\/en\/enterprise\?product=hr/);
  await expect(page.getByRole("heading", { name: "OperiX Enterprise", exact: true })).toBeVisible();

  await page.goto("/en/search?q=employees");
  const lockedResults = page.locator(".search-result-locked");
  await expect(lockedResults).not.toHaveCount(0);
  await expect(lockedResults.first().locator(".enterprise-badge")).toHaveText("Enterprise product");
  await lockedResults.first().click();
  await expect(page).toHaveURL(/\/en\/enterprise\?product=/);
  await expect(page.getByRole("heading", { name: "OperiX Enterprise", exact: true })).toBeVisible();
});

test("Invoice generated articles keep platform and language equivalents", async ({ page }, testInfo) => {
  await page.goto("/en/help/invoice/invoices/invoices-create-web");
  await expect(page.getByRole("heading", { name: /Create and edit an invoice — Web/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Platform" }).getByRole("link", { name: "Mobile" })).toHaveAttribute("href", "/en/help/invoice/invoices/invoices-create-mobile");
  await page.getByRole("navigation", { name: "Platform" }).getByRole("link", { name: "Mobile" }).click();
  await expect(page).toHaveURL(/\/en\/help\/invoice\/invoices\/invoices-create-mobile$/);
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Shqip" })).toHaveAttribute("href", "/sq/help/invoice/invoices/invoices-create-mobile");
  await expect(page.getByText("Screenshot pending capture")).toBeVisible();
});

test("Invoice documentation health dashboard reports coverage", async ({ page }) => {
  await page.goto("/en/admin/invoice-documentation");
  await expect(page.getByRole("heading", { name: "Invoice documentation health", exact: true })).toBeVisible();
  await expect(page.getByText("Localized articles")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("invoice.invoices.create", { exact: true })).toBeVisible();
});

test("Invoice glossary aliases surface bilingual concepts", async ({ page }) => {
  await page.goto("/en/search?q=TVSH");
  await expect(page.getByRole("heading", { name: /Search results for/ })).toBeVisible();
  await expect(page.locator(".search-result").filter({ hasText: "VAT" }).first()).toBeVisible();
  await page.goto("/sq/search?q=fatura");
  await expect(page.locator(".search-result").filter({ hasText: "Fatur" }).first()).toBeVisible();
});

test("Booking documentation keeps platform and language equivalents", async ({ page }, testInfo) => {
  await page.goto("/en/help/booking/web/bookings/booking-create");
  await expect(page.getByRole("heading", { name: "Create a Booking", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Platform" }).getByRole("link", { name: "Mobile" })).toHaveAttribute("href", "/en/help/booking/mobile/bookings/booking-create");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Shqip" })).toHaveAttribute("href", "/sq/help/booking/web/bookings/booking-create");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Close navigation" }).click();
  await page.getByRole("navigation", { name: "Platform" }).getByRole("link", { name: "Mobile" }).click();
  await expect(page).toHaveURL(/\/en\/help\/booking\/mobile\/bookings\/booking-create$/);
});

test("Booking glossary aliases are searchable in Albanian", async ({ page }) => {
  await page.goto("/sq/search?q=rezervim");
  await expect(page.getByRole("heading", { name: /Rezultatet e kërkimit për/ })).toBeVisible();
  await expect(page.locator(".search-result").filter({ hasText: /Rezerv/ }).first()).toBeVisible();
});

test("Booking documentation health dashboard reports registry coverage", async ({ page }) => {
  await page.goto("/en/admin/booking-documentation");
  await expect(page.getByRole("heading", { name: "Booking Documentation Health", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("booking.create", { exact: true })).toBeVisible();
});
