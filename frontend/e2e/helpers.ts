import type { Page } from "@playwright/test";

/** "Continue as guest", pick Unionville as the area, land on the feed. */
export async function signInAsGuest(page: Page, area = "Unionville") {
  await page.goto("/login");
  await page.getByRole("button", { name: /continue as guest/i }).click();
  await page.getByRole("button", { name: /choose my area/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: area }).click();
  await page.waitForURL(/\/feed/);
  await page.getByRole("heading", { name: /near you/i }).waitFor();
  // First-login walkthrough: dismiss if present.
  const skip = page.getByRole("button", { name: /^skip$/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
