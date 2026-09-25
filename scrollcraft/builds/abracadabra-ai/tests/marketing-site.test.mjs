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

test('hero states the speed-of-thought promise with two clear actions', async () => {
  const { context, page } = await openPage();
  const actions = await page.locator('#i .hero__copy .cta a').allTextContents();

  assert.equal((await page.locator('#hero-title').textContent()).trim(), 'From thought to working software.');
  assert.match(await page.locator('#i .hero__copy').textContent(), /speed of thought/i);
  assert.match(await page.locator('#i .hero__copy').textContent(), /AI agents/i);
  assert.match(await page.locator('#i .hero__copy').textContent(), /engineer the intent and context/i);
  assert.match(await page.locator('#i .hero__copy').textContent(), /experienced people direct every decision/i);
  assert.deepEqual(actions.map((action) => action.trim()), [
    'Show us how it works',
    "See what we've built",
  ]);
  assert.equal(await page.locator('#i .hero__copy .cta .cta--primary').count(), 1);
  await context.close();
});

test('orbital horizon video covers the full hero stage behind the compiler', async () => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const { context, page } = await openPage(viewport);
    const video = page.locator('#i .hero-backdrop__video');
    const source = video.locator('source');

    assert.equal(await source.getAttribute('src'), 'assets/orbital-horizon.mp4');
    assert.equal(await source.getAttribute('type'), 'video/mp4');
    assert.equal(await video.getAttribute('autoplay'), '');
    assert.equal(await video.getAttribute('loop'), '');
    assert.equal(await video.getAttribute('playsinline'), '');
    assert.equal(await video.evaluate((element) => element.muted), true);

    const coverage = await page.locator('#i > [data-sc-stage]').evaluate((stage) => {
      const stageRect = stage.getBoundingClientRect();
      const videoRect = stage.querySelector('.hero-backdrop__video').getBoundingClientRect();
      const hero = stage.querySelector('.hero');
      const backdrop = stage.querySelector('.hero-backdrop');

      return {
        backdropBehindHero: Number.parseInt(getComputedStyle(backdrop).zIndex, 10)
          < Number.parseInt(getComputedStyle(hero).zIndex, 10),
        bottomGap: Math.abs(stageRect.bottom - videoRect.bottom),
        leftGap: Math.abs(stageRect.left - videoRect.left),
        rightGap: Math.abs(stageRect.right - videoRect.right),
        topGap: Math.abs(stageRect.top - videoRect.top),
      };
    });

    assert.equal(coverage.backdropBehindHero, true);
    assert.ok(coverage.topGap <= 1);
    assert.ok(coverage.rightGap <= 1);
    assert.ok(coverage.bottomGap <= 1);
    assert.ok(coverage.leftGap <= 1);
    await context.close();
  }
});

test('orbital horizon video pauses when reduced motion is requested', async () => {
  const { context, page } = await openPage({ reducedMotion: 'reduce' });
  const video = page.locator('#i .hero-backdrop__video');

  await page.waitForTimeout(100);
  assert.equal(await video.evaluate((element) => element.paused), true);
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

test('operation compiler engineers intent and context before the parallel agent build', async () => {
  const { context, page } = await openPage();
  const stateLabels = await page.locator('[data-compiler-state]').allTextContents();
  const engineer = page.locator('[data-compiler-panel="engineer"]');

  assert.deepEqual(stateLabels.map((label) => label.trim()), [
    'Describe',
    'Engineer',
    'Build',
    'Run it',
  ]);
  assert.match(await page.locator('[data-compiler-panel="describe"]').textContent(), /customer makes a request/i);
  assert.deepEqual(
    (await engineer.locator('[data-context-stream] [data-stream-name]').allTextContents()).map((label) => label.trim()),
    ['Intent', 'Context'],
  );
  assert.equal(await engineer.locator('[data-context-stream="intent"] li').count(), 3);
  assert.equal(await engineer.locator('[data-context-stream="context"] li').count(), 3);
  assert.match(await engineer.locator('[data-build-brief]').textContent(), /build brief/i);
  assert.match(await engineer.textContent(), /before anything is built/i);
  assert.match(await page.locator('[data-compiler-panel="build"]').textContent(), /engineered brief/i);
  assert.equal(await page.locator('[data-agent-track]').count(), 5);
  assert.deepEqual(
    (await page.locator('[data-agent-track] [data-agent-role]').allTextContents()).map((label) => label.trim()),
    ['Workflow', 'Experience', 'Engineering', 'Quality', 'Launch'],
  );
  assert.deepEqual(
    (await page.locator('[data-agent-track] [data-agent-output]').allTextContents()).map((label) => label.trim()),
    ['Rules mapped', 'Interface shaped', 'System assembled', 'Exceptions tested', 'Demo prepared'],
  );
  assert.match(await page.locator('[data-compiler-panel="run"]').textContent(), /one real example/i);
  assert.match(await page.locator('[data-compiler-panel="run"]').textContent(), /became Showdesk/i);

  await page.getByRole('button', { name: 'Build' }).click();
  assert.equal(await page.locator('.compiler').getAttribute('data-active-state'), 'build');
  assert.equal((await page.locator('[data-compiler-status]').textContent()).trim(), 'Agents building in parallel');

  await page.getByRole('button', { name: 'Skip to working product' }).click();
  assert.equal(await page.locator('.compiler').getAttribute('data-active-state'), 'run');
  assert.equal((await page.locator('[data-compiler-status]').textContent()).trim(), 'System live');
  await context.close();
});

test('desktop scroll drives every pinned sequence and page progress', async () => {
  const { context, page } = await openPage({ width: 1440, height: 1000 });
  const engines = {
    '#i': '.compiler',
    '#time': '.time-engine',
    '#range': '.range-engine',
    '#aeo': '.aeo-engine',
  };

  for (const [selector, expectedState] of [
    ['#i', 'run'],
    ['#time', 'arrive'],
    ['#range', 'commerce'],
    ['#aeo', 'measure'],
  ]) {
    await page.evaluate(({ selector }) => {
      const section = document.querySelector(selector);
      const travel = section.offsetHeight - innerHeight;
      scrollTo({
        top: section.offsetTop + travel * 0.86,
        behavior: 'instant',
      });
    }, { selector });
    await page.waitForTimeout(80);

    const engine = engines[selector];
    assert.equal(await page.locator(engine).getAttribute('data-active-state'), expectedState);
  }

  const progress = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-progress')),
  );
  assert.ok(progress > 0 && progress < 1);
  await context.close();
});

test('dedicated AEO chapter explains the mechanism, proof, and next steps', async () => {
  const { context, page } = await openPage();
  const aeo = page.locator('#aeo');

  assert.equal((await aeo.getByRole('heading', { level: 2 }).first().textContent()).trim(), 'Be the answer AI can verify.');
  assert.deepEqual(
    (await aeo.locator('[data-aeo-state]').allTextContents()).map((label) => label.trim()),
    ['Question', 'Answer', 'Verify', 'Measure'],
  );
  assert.equal(await aeo.getByRole('link', { name: 'Run the Readiness Check' }).getAttribute('href'), 'https://check.abra-ca-dabra.app/check');
  assert.equal(await aeo.getByRole('link', { name: 'Open Schema' }).getAttribute('href'), 'https://schema-two.vercel.app/');
  assert.match(await aeo.textContent(), /201K/);
  assert.match(await aeo.textContent(), /21\.8K/);
  assert.match(await aeo.textContent(), /Google Search Console/);

  await aeo.getByRole('button', { name: 'Measure' }).click();
  assert.equal(await aeo.locator('.aeo-engine').getAttribute('data-active-state'), 'measure');
  await context.close();
});

test('Aramaic origin sits directly under the hero', async () => {
  const { context, page } = await openPage();
  const order = await page.locator('main > section').evaluateAll((sections) =>
    sections.slice(0, 3).map((section) => section.id || section.getAttribute('aria-labelledby')),
  );
  assert.deepEqual(order, ['i', 'name', 'situation-title']);

  const origin = page.locator('#name');
  assert.equal((await origin.getByRole('heading', { level: 2 }).textContent()).trim(), 'I will create as I speak.');
  assert.match(await origin.textContent(), /Aramaic/i);
  assert.match(await origin.textContent(), /avra kadavra/i);
  assert.match(await origin.textContent(), /not a spell/i);
  assert.match(await origin.textContent(), /production software/i);
  await context.close();
});

test('time travel chapter compresses the delivery calendar without inventing durations', async () => {
  const { context, page } = await openPage();
  const time = page.locator('#time');
  const engine = time.locator('.time-engine');

  assert.equal(await time.getAttribute('data-sc-act'), 'pin');
  assert.equal(
    (await time.getByRole('heading', { level: 2 }).first().textContent()).trim(),
    'It feels like magic.',
  );
  assert.match(await time.locator('.time-copy').textContent(), /mostly waiting/i);
  assert.match(await time.locator('.time-copy').textContent(), /no sleight of hand/i);
  assert.deepEqual(
    (await time.locator('[data-time-state]').allTextContents()).map((label) => label.trim()),
    ['Conventional', 'Engineer', 'Parallel', 'Arrive'],
  );
  assert.deepEqual(
    (await time.locator('[data-time-phase]').allTextContents()).map((label) => label.trim()),
    ['Discover', 'Specify', 'Design', 'Build', 'Test', 'Release'],
  );
  assert.equal(await time.locator('[data-time-panel]').count(), 4);
  assert.match(await time.locator('[data-time-panel="conventional"]').textContent(), /handoff/i);
  assert.match(await time.locator('[data-time-panel="engineer"]').textContent(), /one engineered brief/i);
  assert.match(await time.locator('[data-time-panel="parallel"]').textContent(), /five workstreams/i);
  assert.match(await time.locator('[data-time-panel="arrive"]').textContent(), /feels like magic/i);
  assert.equal(await engine.getAttribute('data-active-state'), 'conventional');
  assert.doesNotMatch(await engine.textContent(), /\d+\s*(weeks?|months?|days?|hours?|%)/i);

  await time.getByRole('button', { name: 'Arrive' }).click();
  assert.equal(await engine.getAttribute('data-active-state'), 'arrive');
  assert.equal((await time.locator('[data-time-status]').textContent()).trim(), 'Arrived early');
  assert.equal(await time.locator('[data-time-state="arrive"]').getAttribute('aria-pressed'), 'true');
  await context.close();
});

test('direct navigation keeps the closing brief visible', async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await page.goto(`${origin}/#brief`, { waitUntil: 'networkidle' });
  const brief = page.locator('#brief .label');
  const visibility = await brief.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      opacity: Number.parseFloat(getComputedStyle(element).opacity),
      top: rect.top,
    };
  });

  assert.ok(visibility.opacity > 0.85);
  assert.ok(visibility.top < 800 && visibility.bottom > 0);
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

test('reduced motion exposes every compiler, time travel, and AEO state and keeps film unloaded', async () => {
  const { context, page } = await openPage({
    width: 390,
    height: 844,
    reducedMotion: 'reduce',
  });
  const states = page.locator('[data-compiler-panel]');

  assert.equal(await states.count(), 4);
  for (const state of await states.all()) {
    assert.notEqual(await state.evaluate((element) => getComputedStyle(element).display), 'none');
    assert.equal(await state.evaluate((element) => getComputedStyle(element).visibility), 'visible');
  }
  const aeoStates = page.locator('[data-aeo-panel]');
  assert.equal(await aeoStates.count(), 4);
  for (const state of await aeoStates.all()) {
    assert.notEqual(await state.evaluate((element) => getComputedStyle(element).display), 'none');
    assert.equal(await state.evaluate((element) => getComputedStyle(element).visibility), 'visible');
  }
  const timeStates = page.locator('[data-time-panel]');
  assert.equal(await timeStates.count(), 4);
  for (const state of await timeStates.all()) {
    assert.notEqual(await state.evaluate((element) => getComputedStyle(element).display), 'none');
    assert.equal(await state.evaluate((element) => getComputedStyle(element).visibility), 'visible');
  }
  assert.equal(await page.locator('#film video').getAttribute('src'), null);
  await context.close();
});

test('range chapter sits between time and the answer receipt', async () => {
  const { context, page } = await openPage();
  const ids = await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.id));
  const timeIndex = ids.indexOf('time');
  const rangeIndex = ids.indexOf('range');
  const aeoIndex = ids.indexOf('aeo');
  assert.equal(rangeIndex, timeIndex + 1);
  assert.equal(aeoIndex, rangeIndex + 1);

  const range = page.locator('#range');
  assert.equal(await range.getAttribute('data-specimen'), null);
  assert.equal(
    (await range.getByRole('heading', { level: 2 }).first().textContent()).trim(),
    'Software for the way your company actually works.',
  );
  const rangeCopy = await range.locator('.range-copy').innerText();
  assert.match(rangeCopy, /order of work they already trust/);
  assert.match(rangeCopy, /The screen follows that order/);
  assert.doesNotMatch(rangeCopy, /one shape|still in range/);
  assert.deepEqual(
    (await range.locator('[data-range-state]').allTextContents()).map((label) => label.trim()),
    ['Marketing', 'Applications', 'Machine learning', 'The record', 'The sale'],
  );
  assert.equal(
    await range.locator('.range-engine').getAttribute('aria-label'),
    'The kinds of digital work Abracadabra builds.',
  );

  const plates = await range.locator('[data-range-panel]').evaluateAll((panels) =>
    panels.map((panel) => ({
      state: panel.getAttribute('data-range-panel'),
      text: panel.textContent,
    })),
  );
  assert.deepEqual(
    plates.filter((plate) => plate.text.includes('PIRX')).map((plate) => plate.state),
    ['model'],
  );
  assert.match(plates.find((plate) => plate.state === 'market').text, /words your team already uses/);
  const product = plates.find((plate) => plate.state === 'product').text;
  assert.match(product, /Showdesk/);
  assert.match(product, /ringside phone/);
  assert.doesNotMatch(product, /one shape/);
  assert.match(plates.find((plate) => plate.state === 'record').text, /when you allow it/);
  assert.doesNotMatch(plates.find((plate) => plate.state === 'record').text, /change shape/);
  const commerce = plates.find((plate) => plate.state === 'commerce').text;
  assert.match(commerce, /Canadian Discount Appliances/);
  assert.match(commerce, /before anyone gets in a car/);
  assert.doesNotMatch(commerce, /one store/);
  assert.match(commerce, /the next room is the receipt/i);

  const chapterText = await range.textContent();
  assert.doesNotMatch(chapterText, /201K|21\.8K|SuperPatch|SPSign|S\.T\.A\.R\.|%/);

  const labels = await page.locator('.index a[data-index]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('aria-label')),
  );
  const rangeLabel = labels.indexOf('III — Range');
  assert.equal(labels[rangeLabel + 1], 'IV — Answer');

  const answer = (await page.locator('.faq details').filter({
    has: page.getByText('Do you only build software?', { exact: true }),
  }).locator('p').textContent()).trim();
  assert.match(answer, /^No\./);
  assert.match(await page.locator('script[type="application/ld+json"]').textContent(), /Do you only build software\?/);

  await range.getByRole('button', { name: 'The record' }).click();
  assert.equal(await range.locator('.range-engine').getAttribute('data-active-state'), 'record');
  const pressed = await range.locator('[data-range-state]').evaluateAll((buttons) =>
    buttons.filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent.trim()),
  );
  assert.deepEqual(pressed, ['The record']);
  const controlHeights = await range.locator('[data-range-state]').evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height),
  );
  assert.ok(controlHeights.every((height) => height >= 44));
  await context.close();

  const mobile = await openPage({ width: 390, height: 844 });
  const stack = await mobile.page.locator('#range .range-shell > *').evaluateAll((nodes) =>
    nodes.map((node) => ({
      kind: node.classList.contains('range-engine') ? 'engine' : 'copy',
      top: node.getBoundingClientRect().top,
    })),
  );
  assert.ok(stack.find((node) => node.kind === 'engine').top < stack.find((node) => node.kind === 'copy').top);
  assert.equal(await mobile.page.locator('#range [data-range-state]').count(), 5);
  await mobile.context.close();
});

test('reduced motion stacks every range plate and hides its controls', async () => {
  const { context, page } = await openPage({
    width: 1280,
    height: 800,
    reducedMotion: 'reduce',
  });
  const plates = page.locator('#range [data-range-panel]');

  assert.equal(await plates.count(), 5);
  for (const plate of await plates.all()) {
    const box = await plate.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        display: style.display,
        height: element.getBoundingClientRect().height,
        opacity: Number.parseFloat(style.opacity),
        position: style.position,
        visibility: style.visibility,
      };
    });
    assert.notEqual(box.display, 'none');
    assert.equal(box.visibility, 'visible');
    assert.equal(box.position, 'relative');
    assert.ok(box.opacity > 0.9);
    assert.ok(box.height > 24);
  }

  assert.notEqual(
    await page.locator('#range .range-engine').evaluate((element) => getComputedStyle(element).overflow),
    'hidden',
  );
  assert.equal(
    await page.locator('#range .range-controls').evaluate((element) => getComputedStyle(element).display),
    'none',
  );
  assert.match(
    await page.locator('#range [data-range-panel="commerce"]').textContent(),
    /the next room is the receipt/i,
  );
  await context.close();
});
