import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function stripJsonc(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('Cloudflare Workers serves the catalog as static assets and keeps .html URLs', async () => {
  const wrangler = JSON.parse(stripJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8')));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

  assert.equal(wrangler.name, 'abracadabra-marketing');
  assert.equal(wrangler.assets.directory, '.');
  assert.equal(wrangler.assets.html_handling, 'none');
  assert.equal(wrangler.assets.not_found_handling, '404-page');
  assert.equal(wrangler.main, undefined);
  assert.equal(wrangler.workers_dev, true);
  assert.doesNotMatch(JSON.stringify(wrangler), /cfat_|CLOUDFLARE_API_TOKEN|R2_SECRET|secret_access/i);
  assert.equal(pkg.scripts.deploy, 'wrangler deploy');

  const ignore = await readFile(join(root, '.assetsignore'), 'utf8');
  for (const entry of ['node_modules', 'tests', '.dev.vars', '.env', 'wrangler.jsonc', 'README.md', 'BRIEF.md', 'package.json']) {
    assert.match(ignore, new RegExp(`^${entry.replaceAll('.', '\\.')}(?:/)?$`, 'm'));
  }

  const redirects = await readFile(join(root, '_redirects'), 'utf8');
  assert.match(redirects, /^\/index\.html \/ 301$/m);
  assert.match(redirects, /^\/ \/index\.html 200$/m);

  const headers = await readFile(join(root, '_headers'), 'utf8');
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
  assert.match(headers, /https:\/\/abracadabra-marketing\.abracadabra-ai\.workers\.dev\/\*\n\s+X-Robots-Tag:\s*noindex/);
  assert.doesNotMatch(headers, /X-Robots-Tag:\s*noindex[\s\S]*abra-ca-dabra\.app/);

  const missing = await readFile(join(root, '404.html'), 'utf8');
  assert.match(missing, /<meta name="robots" content="noindex">/);
  assert.match(missing, /href="\/"/);
  assert.match(missing, /From thought to working software/);
});
