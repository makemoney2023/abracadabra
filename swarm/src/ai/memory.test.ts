import { describe, expect, it } from 'vitest';
import { MEMORY_CONTEXT_ENTRIES, buildMemoryContext, memoryKey } from './memory';

const entry = (content: string) => ({ id: content, content, timestamp: 0, executionId: 'ex' });

describe('memoryKey', () => {
  it('scopes memory to one node of one workflow', () => {
    expect(memoryKey('wf-a', 'n1')).toBe('wf-a:n1');
    expect(memoryKey('wf-a', 'n1')).not.toBe(memoryKey('wf-b', 'n1'));
    expect(memoryKey('wf-a', 'n1')).not.toBe(memoryKey('wf-a', 'n2'));
  });
});

describe('buildMemoryContext', () => {
  it('returns nothing when there is no prior run', () => {
    expect(buildMemoryContext(undefined)).toBe('');
    expect(buildMemoryContext([])).toBe('');
  });

  it('frames prior output as reference that must not be reused', () => {
    const ctx = buildMemoryContext([entry('Transform Your Idea')]);
    expect(ctx).toContain('Transform Your Idea');
    expect(ctx).toMatch(/do not repeat/i);
    expect(ctx).toMatch(/current brief/i);
  });

  it('includes only the most recent entries', () => {
    const entries = ['one', 'two', 'three', 'four'].map(entry);
    const ctx = buildMemoryContext(entries);
    const kept = entries.slice(-MEMORY_CONTEXT_ENTRIES).map((e) => e.content);
    for (const c of kept) expect(ctx).toContain(c);
    expect(ctx).not.toContain('one');
  });
});
