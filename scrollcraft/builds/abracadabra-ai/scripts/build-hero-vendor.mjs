/**
 * Rebuild assets/vendor/hero-three.js from the three.js dependency.
 * node scripts/build-hero-vendor.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'assets/vendor/hero-three.js');
const result = spawnSync(
  'npx',
  [
    '--yes',
    'esbuild',
    join(root, 'scripts/hero-three-entry.js'),
    '--bundle',
    '--format=esm',
    '--minify',
    `--outfile=${outfile}`,
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status || 1);
const banner = '/* Three.js r186 (https://github.com/mrdoob/three.js). MIT License. Copyright 2010-2026 Three.js Authors. Bundled for the homepage hero. */\n';
const body = readFileSync(outfile, 'utf8');
if (!body.startsWith('/* Three.js')) writeFileSync(outfile, banner + body);
