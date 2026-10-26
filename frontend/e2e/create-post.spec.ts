import path from "node:path";

import { expect, test } from "@playwright/test";

import { signInAsGuest } from "./helpers";

const FIXTURE = path.join(__dirname, "fixtures", "chair.png");

test("a post with a photo appears in the feed", async ({ page }) => {
  await signInAsGuest(page);
  const title = `E2E chair ${Date.now().toString(36).slice(-5)}`;

  await page.goto("/posts/new");
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
  await expect(page.getByRole("button", { name: /retake or choose/i })).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /post it/i }).click();

  // Lands on the new post, then it is in the feed (live Firestore snapshot or demo store).
  await page.waitForURL((u) => /\/posts\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.goto("/feed");
  await expect(page.getByText(title)).toBeVisible();
});
