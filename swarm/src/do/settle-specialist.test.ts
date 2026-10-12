import { describe, expect, it } from 'vitest';
import { settleSpecialist } from './settle-specialist';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const copy = readFileSync(path.join(__dirname, '../ai/golden/copy.json'), 'utf8');

describe('settleSpecialist', () => {
  it('retries a bad draft once and then fails the check', () => {
    const first = settleSpecialist({ kind: 'copy', draft: '[]', attempt: 1 });
    expect(first.action).toBe('retry');
    if (first.action === 'retry') expect(first.note.length).toBeGreaterThan(0);
    const second = settleSpecialist({ kind: 'copy', draft: '[]', attempt: 2 });
    expect(second.action).toBe('check_failed');
  });

  it('accepts a good draft', () => {
    const result = settleSpecialist({ kind: 'copy', draft: copy, attempt: 1 });
    expect(result.action).toBe('completed');
  });
});
