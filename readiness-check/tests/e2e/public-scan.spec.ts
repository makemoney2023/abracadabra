import { test, expect } from "@playwright/test";

test("soft gate unlocks page matrix", async ({ page }) => {
  await page.route("**/api/scans", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ token: "tok_test", id: "1", status: "queued" }),
      });
      return;
    }
    await route.fallback();
  });

  let unlocked = false;

  await page.route("**/api/scans/tok_test/unlock", async (route) => {
    unlocked = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ unlocked: true }),
    });
  });

  await page.route("**/api/scans/tok_test/fixes", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        domain: "example.com",
        options: [],
        defaultSelection: {
          llmsTxt: false,
          sitemapXml: false,
          robotsTxt: false,
          faqJsonLd: false,
          pageUrls: [],
        },
      }),
    });
  });

  await page.route("**/api/scans/tok_test", async (route) => {
    if (route.request().url().includes("/unlock") || route.request().url().includes("/fixes")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        unlocked
          ? {
              domain: "example.com",
              status: "complete",
              scoreTotal: 42,
              scoreBreakdown: {
                structuredData: 10,
                aiDiscoveryFiles: 5,
                aiCrawlability: 10,
                pageCoverage: 5,
                answerReadiness: 2,
              },
              topGaps: [
                {
                  code: "MISSING_LLMS_TXT",
                  severity: "critical",
                  message: "Missing llms.txt",
                },
              ],
              pagesMissingJsonLd: [
                { url: "https://example.com/", pageType: "home" },
              ],
              unlocked: true,
              findings: [],
              pages: [
                {
                  url: "https://example.com/",
                  pageType: "home",
                  fetchStatus: "ok",
                  hasJsonLd: false,
                  schemaTypes: [],
                },
              ],
            }
          : {
              domain: "example.com",
              status: "complete",
              scoreTotal: 42,
              scoreBreakdown: {
                structuredData: 10,
                aiDiscoveryFiles: 5,
                aiCrawlability: 10,
                pageCoverage: 5,
                answerReadiness: 2,
              },
              topGaps: [
                {
                  code: "MISSING_LLMS_TXT",
                  severity: "critical",
                  message: "Missing llms.txt",
                },
                {
                  code: "NO_JSON_LD_HOME",
                  severity: "critical",
                  message: "No JSON-LD on home",
                },
                {
                  code: "LOW_JSON_LD_COVERAGE",
                  severity: "warn",
                  message: "Low coverage",
                },
              ],
              pagesMissingJsonLd: [
                { url: "https://example.com/", pageType: "home" },
              ],
              unlocked: false,
            },
      ),
    });
  });

  await page.goto("/");
  const hero = page.getByRole("banner", { name: "AI visibility check" });
  await hero.getByLabel("Website URL").fill("https://example.com");
  await hero.getByRole("button", { name: "Check your AI visibility" }).click();
  await expect(page.getByText("42")).toBeVisible();
  await page.getByLabel(/email/i).fill("buyer@example.com");
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page.getByRole("heading", { name: /page matrix/i })).toBeVisible();
  await expect(page.getByText("https://example.com/")).toBeVisible();
});
