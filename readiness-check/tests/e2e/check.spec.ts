import { expect, test } from "@playwright/test";

const TOKEN = "e2echecktoken000000000001";

test("landing, a guide, and a mocked check step", async ({ page }) => {
  await page.route("**/api/assessments", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ token: TOKEN, configVersion: "v1", firstStep: "pressure" }),
    });
  });

  await page.route(`**/api/assessments/${TOKEN}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "in_progress",
          currentStep: "pressure",
          answers: {},
          qualifiers: {},
          gated: true,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, nextStep: "severity:experts_queue" }),
    });
  });

  await page.goto("/check");
  await expect(page.getByRole("heading", { level: 1, name: "Is your business ready to put AI to work?" })).toBeVisible();
  await page.getByRole("button", { name: "Start the check" }).click();
  await expect(page).toHaveURL(new RegExp(`/check/${TOKEN}`));
  await expect(page.getByRole("heading", { name: "Where does the work slow down?" })).toBeVisible();

  await page.goto("/check/guide/readiness");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Could AI do real work here?");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/check");
  await expect(page.getByRole("button", { name: "Start the check" })).toBeVisible();
});
