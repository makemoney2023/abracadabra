import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

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
  '.png': 'image/png',
  '.json': 'application/json',
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
  const requests = [];
  const errors = [];
  page.on('request', (request) => {
    requests.push(new URL(request.url()).pathname);
  });
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });
  page.requests = requests;
  page.errors = errors;
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

test('wordmark is lowercase Inter Tight with an orange dot', async () => {
  const { context, page } = await openPage({ width: 1280, height: 800, reducedMotion: 'reduce' });
  const mark = page.locator('#hero .hero__wm');
  assert.equal((await mark.textContent()).trim(), 'abracadabra.');
  const style = await mark.evaluate((element) => {
    const s = getComputedStyle(element);
    return { family: s.fontFamily, weight: s.fontWeight, spacing: parseFloat(s.letterSpacing) / parseFloat(s.fontSize) };
  });
  assert.match(style.family, /^"?Inter Tight"?/);
  assert.equal(style.weight, '600');
  assert.ok(Math.abs(style.spacing + 0.05) < 0.005, `letter-spacing ${style.spacing}em`);
  assert.equal(await page.locator('#hero .wm-dot').evaluate((element) => getComputedStyle(element).color), 'rgb(255, 75, 36)');
  assert.ok(await page.evaluate(() => document.fonts.check('600 40px "Inter Tight"')));
  assert.match(await page.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily), /Inter Tight/);
  assert.equal(page.requests.some((path) => /tektur/i.test(path)), false);
  await context.close();
});

test('hero headline is real HTML and readable on the first screen', async () => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const { context, page } = await openPage(viewport);
    assert.equal(await page.locator('#hero video').count(), 0);
    assert.equal(page.requests.some((path) => path.endsWith('orbital-horizon.mp4')), false);

    const title = page.locator('#hero-title');
    const box = await title.boundingBox();
    assert.equal(await title.evaluate((element) => getComputedStyle(element).opacity), '1');
    assert.ok(box && box.width > 40 && box.height > 10, 'headline has no box');
    assert.ok(box.y >= 0 && box.y + box.height < viewport.height, `${viewport.width}px headline is outside the first screen`);

    const stage = await page.locator('#hero .hero__stage').boundingBox();
    assert.ok(stage && stage.height >= 200, 'stage did not reserve height');
    const shift = await page.locator('#hero .hero__stage').evaluate((element) => new Promise((resolve) => {
      const before = element.getBoundingClientRect().height;
      requestAnimationFrame(() => {
        resolve(Math.abs(element.getBoundingClientRect().height - before));
      });
    }));
    assert.ok(shift < 1, `stage height moved ${shift}px`);
    assert.deepEqual(page.errors, []);
    await context.close();
  }
});

test('reduced motion shows the wordmark with no canvas', async () => {
  const { context, page } = await openPage({ width: 1280, height: 800, reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('wm-js')), false);
  assert.equal(page.requests.some((path) => path.includes('hero-three.js')), false);
  assert.equal(await page.locator('#hero .hero__canvas').count(), 0);
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#hero .hero__wm').evaluate((element) => getComputedStyle(element).opacity), '1');
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('the canvas reveal plays in full once per session, then a quick version', async () => {
  const { context, page } = await openPage({ width: 1280, height: 800 });
  await page.waitForSelector('#hero .hero__canvas', { timeout: 5000 });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('abra-wm')), '1');
  await page.waitForFunction(() => document.documentElement.classList.contains('wm-dot-on'), { timeout: 5000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#hero .hero__wm')).opacity === '1', { timeout: 2000 });
  const started = Date.now();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('wm-dot-on'), { timeout: 3000 });
  assert.ok(Date.now() - started < 2500, 'repeat visit should use the quick reveal');
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('the reveal loop pauses when the hero leaves the screen', async () => {
  const { context, page } = await openPage({ width: 1280, height: 800 });
  await page.waitForFunction(() => window.__wmRunning && window.__wmRunning(), { timeout: 5000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(() => !window.__wmRunning(), { timeout: 3000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => window.__wmRunning(), { timeout: 3000 });
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('the wordmark sits above the headline on a phone', async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 780 }]) {
    const { context, page } = await openPage({ ...viewport, reducedMotion: 'reduce' });
    const stage = await page.locator('#hero .hero__stage').boundingBox();
    const title = await page.locator('#hero-title').boundingBox();
    const mark = await page.locator('#hero .hero__wm').boundingBox();
    assert.ok(stage.y + stage.height <= title.y, `${viewport.width}px wordmark is not above the headline`);
    assert.ok(mark.width >= viewport.width * 0.7 && mark.x >= 0 && mark.x + mark.width <= viewport.width, `${viewport.width}px wordmark width ${mark.width}`);
    await context.close();
  }
});

test('without a 2D canvas the wordmark still appears', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return this.classList.contains('hero__canvas') ? null : original.apply(this, arguments);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.classList.contains('wm-on'), { timeout: 5000 });
  assert.deepEqual(errors, []);
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

test('restored motion sits under the hero and keeps the original sweep and calendars', async () => {
  const { context, page } = await openPage({ width: 1440, height: 1000 });
  const order = await page.evaluate(() => {
    const ids = ['hero', 'time', 'models'];
    return ids.map((id) => document.getElementById(id).getBoundingClientRect().top);
  });
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], `section order broke at index ${i}`);
  }
  assert.equal(await page.locator('#compiler').isVisible(), false, 'compiler section stays hidden');
  assert.equal(await page.locator('#gantt').count(), 0);
  assert.equal(await page.locator('#time .time-lane').count(), 6);
  await page.locator('#time [data-time-state="parallel"]').click();
  assert.equal(await page.locator('#time .time-engine').getAttribute('data-active-state'), 'parallel');
  await context.close();
});

test('reduced motion keeps a static calendar', async () => {
  const { context, page } = await openPage({ width: 1440, height: 1000, reducedMotion: 'reduce' });
  assert.equal(await page.locator('#time .time-engine').getAttribute('data-active-state'), 'arrive');
  await context.close();
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
  const services = await desktop.page.locator('.site-nav__services > summary').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { height: rect.height, right: rect.right, text: node.textContent.trim(), viewport: innerWidth };
  });
  assert.equal(services.text, 'Services');
  assert.ok(services.height >= 44, 'Services target is under 44px');
  assert.ok(services.right <= services.viewport + 1, 'Services overflows the bar');
  assert.equal(await desktop.page.locator('.site-nav__mega').evaluate((node) => getComputedStyle(node).display), 'none');
  await desktop.context.close();
});

test('open Services menu stacks page links under the function list on a phone', async () => {
  const { context, page } = await openPage({ width: 375, height: 812 });
  await page.locator('.site-nav__toggle').click();
  await page.locator('.site-nav__services > summary').click();
  const layout = await page.evaluate(() => {
    const menu = document.querySelector('.site-nav__links');
    const services = document.querySelector('.site-nav__services');
    const platform = document.querySelector('.site-nav__fn-name[href="/services/#platform"]');
    const portfolio = [...menu.querySelectorAll(':scope > a')].find((link) => link.textContent.trim() === 'Portfolio');
    const cta = menu.querySelector('.site-nav__cta');
    const place = (node) => {
      const box = node.getBoundingClientRect();
      const menuBox = menu.getBoundingClientRect();
      return {
        bottom: box.bottom - menuBox.top + menu.scrollTop,
        left: box.left,
        top: box.top - menuBox.top + menu.scrollTop,
      };
    };
    const servicesPlace = place(services);
    const platformPlace = place(platform);
    const portfolioPlace = place(portfolio);
    const ctaPlace = place(cta);
    menu.scrollTop = menu.scrollHeight;
    const ctaVisible = cta.getBoundingClientRect();
    const menuAfter = menu.getBoundingClientRect();
    return {
      ctaTop: ctaPlace.top,
      ctaVisibleBottom: ctaVisible.bottom,
      ctaVisibleTop: ctaVisible.top,
      menuBottom: menuAfter.bottom,
      menuTop: menuAfter.top,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      platformBottom: platformPlace.bottom,
      portfolioLeft: portfolioPlace.left,
      portfolioTop: portfolioPlace.top,
      scrollHeight: menu.scrollHeight,
      clientHeight: menu.clientHeight,
      servicesBottom: servicesPlace.bottom,
      servicesLeft: servicesPlace.left,
    };
  });
  assert.ok(
    layout.portfolioTop >= layout.servicesBottom - 1,
    `Portfolio top ${layout.portfolioTop} overlaps services bottom ${layout.servicesBottom}`,
  );
  assert.ok(
    Math.abs(layout.portfolioLeft - layout.servicesLeft) < 8,
    `Portfolio left ${layout.portfolioLeft} is not in the services column ${layout.servicesLeft}`,
  );
  assert.ok(layout.ctaTop >= layout.platformBottom - 1, 'Start a project is not below Platform');
  assert.ok(
    layout.ctaVisibleTop >= layout.menuTop - 1 && layout.ctaVisibleBottom <= layout.menuBottom + 1,
    'Start a project is outside the scrolled menu',
  );
  assert.ok(layout.scrollHeight > layout.clientHeight, 'open menu does not scroll');
  assert.ok(layout.pageOverflow <= 1, `page overflows by ${layout.pageOverflow}px`);
  await context.close();
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
