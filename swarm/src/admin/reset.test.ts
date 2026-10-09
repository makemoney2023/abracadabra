import { describe, expect, it } from 'vitest';
import { RESET_R2_PREFIXES, clearR2Prefixes, isAuthorizedReset } from './reset';

const req = (auth?: string) =>
  new Request('https://x/admin/reset', { method: 'POST', headers: auth ? { Authorization: auth } : {} });

describe('isAuthorizedReset', () => {
  it('is disabled when no token is configured', () => {
    expect(isAuthorizedReset(req('Bearer anything'), undefined)).toBe(false);
    expect(isAuthorizedReset(req('Bearer '), '')).toBe(false);
  });

  it('requires the exact bearer token', () => {
    expect(isAuthorizedReset(req(), 'secret')).toBe(false);
    expect(isAuthorizedReset(req('Bearer wrong'), 'secret')).toBe(false);
    expect(isAuthorizedReset(req('secret'), 'secret')).toBe(false);
    expect(isAuthorizedReset(req('Bearer secret'), 'secret')).toBe(true);
  });
});

function fakeBucket(keys: string[], pageSize = 2) {
  const store = new Set(keys);
  return {
    store,
    async list({ prefix, cursor }: { prefix: string; cursor?: string }) {
      const all = [...store].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + pageSize);
      const truncated = start + pageSize < all.length;
      return {
        objects: page.map((key) => ({ key })),
        truncated,
        cursor: truncated ? String(start + pageSize) : undefined,
      };
    },
    async delete(k: string | string[]) {
      for (const key of Array.isArray(k) ? k : [k]) store.delete(key);
    },
  };
}

describe('clearR2Prefixes', () => {
  it('deletes every object under the run-data prefixes across pages and nothing else', async () => {
    const bucket = fakeBucket([
      'artifacts/a.json',
      'artifacts/b.json',
      'artifacts/c.json',
      'reports/a.pdf',
      'skills/ad-creative/SKILL.md',
    ]);
    const deleted = await clearR2Prefixes(bucket, RESET_R2_PREFIXES);
    expect(deleted).toBe(4);
    expect([...bucket.store]).toEqual(['skills/ad-creative/SKILL.md']);
  });
});
