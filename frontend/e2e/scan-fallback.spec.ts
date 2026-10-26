import path from "node:path";

import { expect, test } from "@playwright/test";

import { signInAsGuest } from "./helpers";

const FIXTURE = path.join(__dirname, "fixtures", "chair.png");

test("scan without an AI key falls back to the help-us-identify picker", async ({ page }) => {
  await signInAsGuest(page);

  // Simulate a deployment without GEMINI_API_KEY: the route answers { fallback: true }.
  // (Running the server with the key unset produces the identical response.)
  await page.route("**/api/scan", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ fallback: true, reason: "not_configured", message: "The AI scanner isn't configured on this deployment yet." }),
    }),
  );

  await page.goto("/scan");
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
  await expect(page.getByRole("button", { name: /retake photo/i })).toBeVisible();
  await page.getByLabel(/what is it/i).fill("zzqx"); // matches no rule → picker
  await page.getByRole("button", { name: /^identify$/i }).click();

  await page.waitForURL(/\/scan\/result/);
  await expect(page.getByRole("heading", { name: /help us identify it/i })).toBeVisible();
  await page.getByPlaceholder(/foam tray/i).fill("styrofoam");
  await page.getByRole("button", { name: /styrofoam \(clean\)/i }).click();
  await expect(page.getByText(/recycling depot/i).first()).toBeVisible();
});
