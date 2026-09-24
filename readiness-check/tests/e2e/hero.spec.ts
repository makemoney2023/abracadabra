import { expect, test } from "@playwright/test";

test("landing page opens with the orbital video hero and scan action", async ({ page }) => {
  await page.goto("/");

  const hero = page.getByRole("banner", { name: "AI visibility check" });
  const video = hero.locator("video");

  await expect(hero.getByRole("heading", { level: 1, name: "Schema" })).toBeVisible();
  await expect(hero.getByLabel("Website URL")).toBeVisible();
  await expect(hero.getByRole("button", { name: "Check your AI visibility" })).toBeVisible();
  await expect(video).toHaveAttribute("autoplay", "");
  await expect(video).toHaveAttribute("muted", "");
  await expect(video).toHaveAttribute("loop", "");
  await expect(video).toHaveAttribute("playsinline", "");
});

test("orbital hero stops decorative motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const video = page.getByRole("banner", { name: "AI visibility check" }).locator("video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
});
