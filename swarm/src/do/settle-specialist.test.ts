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
    const prose = settleSpecialist({ kind: 'copy', draft: '8001: Invalid input', attempt: 1 });
    expect(prose.action).toBe('retry');
    if (prose.action === 'retry') expect(prose.note).toMatch(/JSON/);
    const second = settleSpecialist({ kind: 'copy', draft: '[]', attempt: 2 });
    expect(second.action).toBe('check_failed');
  });

  it('notes ignored prose on a completed receipt', () => {
    const row = '[{"name":"A","fact":"one","source":"https://a.example"}]';
    const result = settleSpecialist({ kind: 'research', draft: `Here is the page:\n${row}`, attempt: 1 });
    expect(result.action).toBe('completed');
    if (result.action === 'completed') expect(result.receipt.missing).toEqual(['extra text ignored']);
  });

  it('stops on a question instead of retrying the page', () => {
    const result = settleSpecialist({
      kind: 'visual',
      draft: JSON.stringify({ questions: ['Which aspect ratio?'] }),
      attempt: 1,
    });
    expect(result.action).toBe('question');
    if (result.action === 'question') expect(result.questions).toEqual(['Which aspect ratio?']);
  });

  it('accepts a good draft', () => {
    const result = settleSpecialist({ kind: 'copy', draft: copy, attempt: 1 });
    expect(result.action).toBe('completed');
  });
});
