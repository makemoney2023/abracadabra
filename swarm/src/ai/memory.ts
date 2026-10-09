import type { MemoryEntry } from '../types';

/** Prior runs of a node that are shown to its next run. */
export const MEMORY_CONTEXT_ENTRIES = 2;

/**
 * Memory belongs to one node of one workflow. Keying by agent type alone leaked
 * every client's past output into every other run of that agent type.
 */
export function memoryKey(workflowId: string, nodeId: string): string {
  return `${workflowId}:${nodeId}`;
}

export function buildMemoryContext(entries: MemoryEntry[] | undefined): string {
  if (!entries || entries.length === 0) return '';
  const recent = entries.slice(-MEMORY_CONTEXT_ENTRIES).map((e) => e.content).join('\n---\n');
  return (
    '\n\nEarlier runs of this step (reference only — do not repeat or reuse these concepts; ' +
    'the current brief takes priority):\n' +
    recent
  );
}
