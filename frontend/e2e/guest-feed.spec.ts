import { expect, test } from "@playwright/test";

import { signInAsGuest } from "./helpers";

test("guest sign-in renders the feed and survives a reload", async ({ page }) => {
  await signInAsGuest(page);
  await expect(page.getByRole("heading", { name: /near you/i })).toBeVisible();
  // Either real listings or the badged sample listings — never an empty page.
  await expect(page.locator("a[href^='/posts/']:not([href='/posts/new'])").first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /near you/i })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
});
