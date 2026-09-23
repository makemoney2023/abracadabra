import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
};

let browser;
let origin;
let server;

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
      const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = join(root, safePath);
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
  });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
});

async function openPage({ width = 1280, height = 800, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion,
  });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  return { context, page };
}

test('hero has one primary and one secondary action', async () => {
  const { context, page } = await openPage();
  const actions = await page.locator('#i .hero__copy .cta a').allTextContents();

  assert.deepEqual(actions.map((action) => action.trim()), [
    'Describe how you work',
    'Watch the work',
  ]);
  assert.equal(await page.locator('#i .hero__copy .cta .cta--primary').count(), 1);
  await context.close();
});

test('chapter navigation exposes labels and 44px targets', async () => {
  const { context, page } = await openPage();
  const targets = await page.locator('.index a[data-index]').evaluateAll((links) =>
    links.map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        current: link.getAttribute('aria-current'),
        height: rect.height,
        label: link.getAttribute('aria-label'),
        width: rect.width,
      };
    }),
  );

  assert.ok(targets.every(({ label }) => label && label.includes('—')));
  assert.ok(targets.every(({ height, width }) => height >= 44 && width >= 44));
  assert.ok(targets.some(({ current }) => current === 'location'));
  await context.close();
});

test('mobile selected work renders complete vertical cards', async () => {
  const { context, page } = await openPage({ width: 390, height: 844 });
  const layout = await page.locator('#iii').evaluate((section) => {
    const rail = section.querySelector('.rail');
    const cards = [...section.querySelectorAll('.item')].map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    });
    return {
      cards,
      railTransform: getComputedStyle(rail).transform,
      railWidth: rail.getBoundingClientRect().width,
      viewportWidth: innerWidth,
    };
  });

  assert.equal(layout.railTransform, 'none');
  assert.ok(layout.railWidth <= layout.viewportWidth);
  assert.ok(layout.cards.every(({ left, right }) => left >= 0 && right <= layout.viewportWidth));
  assert.ok(layout.cards.every((card, index, cards) => index === 0 || card.top >= cards[index - 1].bottom));
  await context.close();
});

test('required responsive widths do not create horizontal page overflow', async () => {
  for (const width of [320, 390, 430, 768, 1280, 1440, 1920]) {
    const { context, page } = await openPage({ width, height: width < 500 ? 844 : 1000 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    assert.ok(
      dimensions.scrollWidth <= dimensions.clientWidth,
      `${width}px viewport overflows by ${dimensions.scrollWidth - dimensions.clientWidth}px`,
    );
    await context.close();
  }
});

test('hero intent demonstration has accessible states and a skip control', async () => {
  const { context, page } = await openPage();
  const stateLabels = await page.locator('[data-intent-state]').allTextContents();

  assert.deepEqual(stateLabels.map((label) => label.trim()), [
    'Say it',
    'Structure it',
    'Run it',
  ]);
  await page.getByRole('button', { name: 'Skip to working product' }).click();
  assert.equal(await page.locator('.intent-demo').getAttribute('data-active-state'), 'run');
  await context.close();
});

test('film caption minimizes on mobile without hiding its explanation', async () => {
  const { context, page } = await openPage({ width: 390, height: 844 });
  const toggle = page.locator('.film-toggle');

  await page.locator('#film').scrollIntoViewIfNeeded();
  assert.equal((await toggle.textContent()).trim(), 'Minimize film details');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(await page.locator('#film .film-details').getAttribute('hidden') !== null);
  await context.close();
});

test('reduced motion exposes all three intent states and keeps film unloaded', async () => {
  const { context, page } = await openPage({
    width: 390,
    height: 844,
    reducedMotion: 'reduce',
  });
  const states = page.locator('[data-state-panel]');

  assert.equal(await states.count(), 3);
  for (const state of await states.all()) {
    assert.notEqual(await state.evaluate((element) => getComputedStyle(element).display), 'none');
    assert.equal(await state.evaluate((element) => getComputedStyle(element).visibility), 'visible');
  }
  assert.equal(await page.locator('#film video').getAttribute('src'), null);
  await context.close();
});
