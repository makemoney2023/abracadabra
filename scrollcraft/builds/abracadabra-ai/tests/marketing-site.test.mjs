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
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
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

test('hero states the owner outcome with two clear actions', async () => {
  const { context, page } = await openPage();
  const actions = await page.locator('#hero .hero__actions a').allTextContents();

  assert.equal((await page.locator('#hero-title').textContent()).trim(), 'Custom software, built for how you work.');
  assert.match(await page.locator('#hero .hero__copy').textContent(), /fit your business/i);
  assert.match(await page.locator('#hero .hero__copy').textContent(), /not the other way around/i);
  assert.deepEqual(actions.map((action) => action.trim()), [
    'Start a project',
    'See the work',
  ]);
  assert.equal(await page.locator('#hero .hero__actions .btn--primary').count(), 1);
  await context.close();
});

test('orbital horizon video covers the hero behind the copy', async () => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const { context, page } = await openPage(viewport);
    const video = page.locator('#hero .hero__video');
    const source = video.locator('source');

    assert.equal(await source.getAttribute('src'), 'assets/orbital-horizon.mp4');
    assert.equal(await source.getAttribute('type'), 'video/mp4');
    assert.equal(await video.getAttribute('autoplay'), '');
    assert.equal(await video.getAttribute('loop'), '');
    assert.equal(await video.getAttribute('playsinline'), '');
    assert.equal(await video.evaluate((element) => element.muted), true);

    const coverage = await page.locator('#hero').evaluate((hero) => {
      const heroRect = hero.getBoundingClientRect();
      const videoRect = hero.querySelector('.hero__video').getBoundingClientRect();
      const copy = hero.querySelector('.hero__copy');
      const film = hero.querySelector('.hero__video');

      return {
        filmBehindCopy: Number.parseInt(getComputedStyle(film).zIndex, 10)
          < Number.parseInt(getComputedStyle(copy).zIndex, 10),
        bottomGap: Math.abs(heroRect.bottom - videoRect.bottom),
        leftGap: Math.abs(heroRect.left - videoRect.left),
        rightGap: Math.abs(heroRect.right - videoRect.right),
        topGap: Math.abs(heroRect.top - videoRect.top),
      };
    });

    assert.equal(coverage.filmBehindCopy, true);
    assert.ok(coverage.topGap <= 1);
    assert.ok(coverage.rightGap <= 1);
    assert.ok(coverage.bottomGap <= 1);
    assert.ok(coverage.leftGap <= 1);
    await context.close();
  }
});

test('orbital horizon video pauses when reduced motion is requested', async () => {
  const { context, page } = await openPage({ reducedMotion: 'reduce' });
  const video = page.locator('#hero .hero__video');

  await page.waitForTimeout(100);
  assert.equal(await video.evaluate((element) => element.paused), true);
  await context.close();
});

test('required responsive widths do not create horizontal page overflow', async () => {
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
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

test('inner pages stay inside the viewport at the required widths', async () => {
  const paths = [
    '/services/index.html',
    '/services/ai-assistants-and-agents/index.html',
    '/services/ai-visibility/index.html',
    '/portfolio/index.html',
    '/portfolio/pirx/index.html',
    '/products/index.html',
    '/course/llm-leverage/index.html',
    '/blog/index.html',
    '/blog/ai-readiness-assessment/index.html',
  ];

  for (const width of [375, 768, 1024, 1440, 1920]) {
    const { context, page } = await openPage({ width, height: width < 500 ? 812 : 1000 });
    for (const path of paths) {
      await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(
        dimensions.scrollWidth <= dimensions.clientWidth,
        `${path} at ${width}px overflows by ${dimensions.scrollWidth - dimensions.clientWidth}px`,
      );
    }
    await context.close();
  }
});

test('footer link row stays below the hero on a phone', async () => {
  const { context, page } = await openPage({ width: 390, height: 844 });
  const placement = await page.evaluate(() => {
    const hero = document.querySelector('#hero').getBoundingClientRect();
    const foot = document.querySelector('.site-foot').getBoundingClientRect();
    const intersects = foot.top < hero.bottom && foot.bottom > hero.top
      && foot.left < hero.right && foot.right > hero.left;
    return {
      footTop: foot.top,
      heroBottom: hero.bottom,
      intersects,
    };
  });

  assert.equal(placement.intersects, false);
  assert.ok(
    placement.footTop >= placement.heroBottom - 1,
    `footer top ${placement.footTop} overlaps hero bottom ${placement.heroBottom}`,
  );
  await context.close();
});

test('site nav uses a compact menu below 1100px and a full bar from 1280px', async () => {
  for (const width of [390, 1024]) {
    const compact = await openPage({ width, height: width < 500 ? 844 : 1000 });
    assert.equal(await compact.page.locator('.site-nav__toggle').count(), 1);
    const closed = await compact.page.locator('.site-nav__links a', { hasText: 'Course' }).evaluate((link) => {
      const rect = link.getBoundingClientRect();
      return rect.width === 0 || rect.height === 0;
    });
    assert.equal(closed, true, `${width}px Course is visible before Menu`);
    await compact.page.locator('.site-nav__toggle').click();
    const opened = await compact.page.locator('.site-nav__links > a').evaluateAll((links) => links.map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        text: link.textContent.trim(),
        top: rect.top,
        viewport: innerWidth,
      };
    }));
    for (const name of ['Portfolio', 'Products', 'Course', 'Blog', 'Start a project']) {
      const link = opened.find((item) => item.text === name);
      assert.ok(link, `${width}px ${name}`);
      assert.ok(link.left >= 0 && link.right <= link.viewport + 1, `${width}px ${name} is clipped`);
      assert.ok(link.bottom > link.top, `${width}px ${name} is hidden`);
    }
    const overflow = await compact.page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(overflow.scrollWidth <= overflow.clientWidth, `${width}px menu overflows`);
    await compact.context.close();
  }

  const service = await openPage({ width: 375, height: 812 });
  await service.page.goto(`${origin}/services/ai-visibility/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await service.page.locator('.site-nav__toggle').count(), 1);
  await service.page.locator('.site-nav__toggle').click();
  const serviceLinks = await service.page.locator('.site-nav__links > a').evaluateAll((links) => links.map((link) => {
    const rect = link.getBoundingClientRect();
    return { right: rect.right, text: link.textContent.trim(), viewport: innerWidth };
  }));
  for (const name of ['Course', 'Blog']) {
    const link = serviceLinks.find((item) => item.text === name);
    assert.ok(link && link.right <= link.viewport + 1, name);
  }
  await service.context.close();

  const desktop = await openPage({ width: 1280, height: 1000 });
  assert.equal(
    await desktop.page.locator('.site-nav__toggle').evaluate((toggle) => getComputedStyle(toggle).display),
    'none',
  );
  const bar = await desktop.page.locator('.site-nav__links > a').evaluateAll((links) => links.map((link) => {
    const rect = link.getBoundingClientRect();
    return {
      height: rect.height,
      left: rect.left,
      right: rect.right,
      text: link.textContent.trim(),
      viewport: innerWidth,
    };
  }));
  for (const name of ['Portfolio', 'Products', 'Course', 'Blog', 'Start a project']) {
    const link = bar.find((item) => item.text === name);
    assert.ok(link, name);
    assert.ok(link.left >= -1 && link.right <= link.viewport + 1, `${name} overflows the bar`);
    assert.ok(link.height >= 44, `${name} target is under 44px`);
  }
  await desktop.context.close();
});

test('hero copy is a left column, with actions in a row from 1024px and stacked below', async () => {
  const desktop = await openPage({ width: 1280, height: 900 });
  const wide = await desktop.page.locator('#hero').evaluate((hero) => {
    const copy = hero.querySelector('.hero__copy').getBoundingClientRect();
    const pad = Number.parseFloat(getComputedStyle(hero).paddingLeft);
    const actions = hero.querySelector('.hero__actions');
    const buttons = [...actions.querySelectorAll('a')].map((link) => link.getBoundingClientRect());
    return {
      align: getComputedStyle(hero).textAlign,
      buttons: buttons.map((box) => ({ left: box.left, top: box.top, width: box.width })),
      copyLeft: copy.left,
      direction: getComputedStyle(actions).flexDirection,
      heroLeft: hero.getBoundingClientRect().left,
      pad,
    };
  });
  assert.equal(wide.align, 'left');
  assert.equal(wide.direction, 'row');
  assert.ok(Math.abs(wide.copyLeft - (wide.heroLeft + wide.pad)) < 4);
  assert.ok(Math.abs(wide.buttons[0].top - wide.buttons[1].top) < 4);
  assert.ok(wide.buttons[1].left > wide.buttons[0].left + 8);
  await desktop.context.close();

  for (const width of [375, 768]) {
    const narrow = await openPage({ width, height: width < 500 ? 812 : 1000 });
    const stacked = await narrow.page.locator('#hero').evaluate((hero) => {
      const actions = hero.querySelector('.hero__actions');
      const actionBox = actions.getBoundingClientRect();
      const buttons = [...actions.querySelectorAll('a')].map((link) => link.getBoundingClientRect());
      return {
        align: getComputedStyle(hero).textAlign,
        buttons: buttons.map((box) => ({ bottom: box.bottom, top: box.top, width: box.width })),
        direction: getComputedStyle(actions).flexDirection,
        width: actionBox.width,
      };
    });
    assert.equal(stacked.align, 'left', `${width}px`);
    assert.equal(stacked.direction, 'column', `${width}px`);
    assert.ok(stacked.buttons[1].top >= stacked.buttons[0].bottom - 1, `${width}px buttons overlap`);
    assert.ok(stacked.buttons[0].width >= stacked.width - 2, `${width}px primary is not full width`);
    assert.ok(stacked.buttons[1].width >= stacked.width - 2, `${width}px secondary is not full width`);
    await narrow.context.close();
  }
});

test('service page heroes use the same left column and stacked actions', async () => {
  const desktop = await openPage({ width: 1024, height: 900 });
  await desktop.page.goto(`${origin}/services/ai-visibility/index.html`, { waitUntil: 'domcontentloaded' });
  const wide = await desktop.page.locator('main.site-page').evaluate((main) => {
    const heading = main.querySelector('h1').getBoundingClientRect();
    const actions = main.querySelector('.sales-actions');
    const buttons = [...actions.querySelectorAll('a')].map((link) => link.getBoundingClientRect());
    return {
      align: getComputedStyle(main.querySelector('h1')).textAlign,
      direction: getComputedStyle(actions).flexDirection,
      headingLeft: heading.left,
      mainLeft: main.getBoundingClientRect().left,
      secondLeft: buttons[1].left,
      tops: buttons.map((box) => box.top),
    };
  });
  assert.equal(wide.align, 'left');
  assert.equal(wide.direction, 'row');
  assert.ok(Math.abs(wide.headingLeft - wide.mainLeft) < 2);
  assert.ok(Math.abs(wide.tops[0] - wide.tops[1]) < 4);
  assert.ok(wide.secondLeft > wide.mainLeft + 8);
  await desktop.context.close();

  const phone = await openPage({ width: 375, height: 812 });
  await phone.page.goto(`${origin}/services/ai-assistants-and-agents/index.html`, { waitUntil: 'domcontentloaded' });
  const stacked = await phone.page.locator('main.site-page').evaluate((main) => {
    const actions = main.querySelector('.sales-actions');
    const actionBox = actions.getBoundingClientRect();
    const buttons = [...actions.querySelectorAll('a')].map((link) => link.getBoundingClientRect());
    return {
      align: getComputedStyle(main.querySelector('h1')).textAlign,
      direction: getComputedStyle(actions).flexDirection,
      headingLeft: main.querySelector('h1').getBoundingClientRect().left,
      mainLeft: main.getBoundingClientRect().left,
      primaryWidth: buttons[0].width,
      secondaryTop: buttons[1].top,
      primaryBottom: buttons[0].bottom,
      width: actionBox.width,
    };
  });
  assert.equal(stacked.align, 'left');
  assert.equal(stacked.direction, 'column');
  assert.ok(Math.abs(stacked.headingLeft - stacked.mainLeft) < 2);
  assert.ok(stacked.secondaryTop >= stacked.primaryBottom - 1);
  assert.ok(stacked.primaryWidth >= stacked.width - 2);
  await phone.context.close();
});
