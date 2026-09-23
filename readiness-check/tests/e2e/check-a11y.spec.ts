import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("check landing and a guide have no serious accessibility violations", async ({ page }) => {
  await page.goto("/check");
  const landing = await new AxeBuilder({ page }).analyze();
  expect(landing.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);

  await page.goto("/check/guide/band/early");
  const guide = await new AxeBuilder({ page }).analyze();
  expect(guide.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});
