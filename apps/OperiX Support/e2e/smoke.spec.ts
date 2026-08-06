import { expect, test } from "@playwright/test";

test("health endpoint is public and identifies the web service", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).service).toBe("operix-support-web");
});

test("login screen renders a usable accessible form", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/OperiX Support/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});
