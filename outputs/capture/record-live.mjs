/**
 * Record live product surfaces for the Abracadabra AI portfolio.
 * Uses system Chrome + playwright-core. Writes WebM under outputs/footage/.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const footageDir = path.join(root, "footage");
const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const VIEW = { width: 1440, height: 900 };

const jobs = [
  {
    id: "showdesk-home",
    url: "https://www.showdesk-app.com/",
    async play(page) {
      await page.waitForTimeout(2000);
      const demo = page.locator("#demo, [href='#demo']").first();
      if (await demo.count()) {
        await demo.click({ timeout: 4000 }).catch(() => {});
      }
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(2500);
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(3500);
      const play = page.getByRole("button", { name: /play|watch|see it/i }).first();
      if (await play.count()) await play.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(6000);
    },
  },
  {
    id: "llmcourse-home-lesson",
    url: "https://llm-leverage-course.vercel.app/",
    async play(page) {
      await page.waitForTimeout(1800);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(1200);
      const preview = page.getByRole("link", { name: /preview the course/i }).first();
      if (await preview.count()) {
        await preview.click();
        await page.waitForTimeout(2000);
      } else {
        await page.goto("https://llm-leverage-course.vercel.app/modules/mental-model", {
          waitUntil: "domcontentloaded",
        });
      }
      for (let i = 0; i < 3; i++) {
        const mark = page.getByRole("button", { name: /mark step done/i }).first();
        if (await mark.count()) {
          await mark.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(900);
        }
      }
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(1500);
    },
  },
  {
    id: "llmcourse-workshops",
    url: "https://llm-leverage-course.vercel.app/workshops",
    async play(page) {
      await page.waitForTimeout(1500);
      const session = page.getByRole("link").filter({ hasText: /session|research|wall/i }).first();
      if (await session.count()) {
        await session.click();
        await page.waitForTimeout(1600);
        const next = page.getByRole("button", { name: /next slide/i }).first();
        if (await next.count()) {
          await next.click().catch(() => {});
          await page.waitForTimeout(1200);
          await next.click().catch(() => {});
        }
      }
      await page.waitForTimeout(2000);
    },
  },
  {
    id: "cda-home-pdp",
    url: "https://www.cdastore.ca/",
    async play(page) {
      await page.waitForTimeout(2500);
      for (const name of [/accept/i, /agree/i, /got it/i, /close/i]) {
        const btn = page.getByRole("button", { name }).first();
        if (await btn.count()) await btn.click({ timeout: 1500 }).catch(() => {});
      }
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(1200);
      const product = page.locator('a[href*="/product"], a[href*="/products"]').first();
      if (await product.count()) {
        await product.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2500);
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(2000);
      } else {
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(2500);
      }
    },
  },
  {
    id: "schema-home-scan",
    url: "https://schema-two.vercel.app/",
    async play(page) {
      await page.waitForTimeout(2000);
      await page.mouse.wheel(0, 400);
      const input = page.locator('input[type="url"], input[name="url"], input[placeholder*="http" i]').first();
      if (await input.count()) {
        await input.fill("https://www.cdastore.ca/");
        await page.waitForTimeout(400);
        const go = page.getByRole("button", { name: /scan|check|analyze|run/i }).first();
        if (await go.count()) await go.click().catch(() => {});
        await page.waitForTimeout(8000);
      } else {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(2500);
      }
    },
  },
];

async function record(job) {
  const outDir = path.join(footageDir, job.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const context = await chromium.launchPersistentContext("", {
    executablePath: chrome,
    headless: true,
    viewport: VIEW,
    recordVideo: { dir: outDir, size: VIEW },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15000);
  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await job.play(page);
  } catch (err) {
    console.error(`[${job.id}] play error:`, err.message);
    await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: false }).catch(() => {});
  }
  await context.close();
  const webm = fs.readdirSync(outDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`No webm for ${job.id}`);
  const dest = path.join(footageDir, `${job.id}.webm`);
  fs.renameSync(path.join(outDir, webm), dest);
  console.log("wrote", dest);
}

async function main() {
  fs.mkdirSync(footageDir, { recursive: true });
  const only = process.argv[2];
  const run = only ? jobs.filter((j) => j.id === only) : jobs;
  if (!run.length) {
    console.error("unknown job", only);
    process.exit(1);
  }
  for (const job of run) {
    console.log("recording", job.id);
    await record(job);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
