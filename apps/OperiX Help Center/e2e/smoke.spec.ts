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
