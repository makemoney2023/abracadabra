import { describe, expect, it } from 'vitest';
import {
  MODEL_STEP_TIMEOUT_MS,
  RUNNING_GRACE_MS,
  RUNNING_GIVE_UP_MS,
  STEP_TIMEOUT_MESSAGE,
  RESUME_ALARM_MS,
  classifyResume,
  nextResumeAlarm,
  shouldTryNextModel,
  withStepTimeout,
} from './resume';

const NOW = 1_000_000;

describe('classifyResume', () => {
  it('keeps a finished step finished', () => {
    expect(classifyResume({ status: 'done', startedAt: NOW - 10_000 }, NOW)).toBe('done');
    expect(classifyResume({ status: 'error', startedAt: NOW - 10_000 }, NOW)).toBe('error');
  });

  it('leaves a young running step alone so a status poll does not restart it', () => {
    expect(classifyResume({ status: 'running', startedAt: NOW - (RUNNING_GRACE_MS - 1), attempts: 1 }, NOW)).toBe('in-flight');
  });

  it('retries a running step once after the grace period', () => {
    expect(classifyResume({ status: 'running', startedAt: NOW - (RUNNING_GRACE_MS + 1), attempts: 1 }, NOW)).toBe('retry');
  });

  it('gives up after a retry is still running, or when the step is older than the backstop', () => {
    expect(classifyResume({ status: 'running', startedAt: NOW - (RUNNING_GRACE_MS + 1), attempts: 2 }, NOW)).toBe('give-up');
    expect(classifyResume({ status: 'running', startedAt: NOW - RUNNING_GIVE_UP_MS, attempts: 1 }, NOW)).toBe('give-up');
    expect(classifyResume({ status: 'running' }, NOW)).toBe('give-up');
  });
});

describe('withStepTimeout', () => {
  it('returns the step result when the model finishes first', async () => {
    await expect(withStepTimeout(Promise.resolve('paper'), 50, STEP_TIMEOUT_MESSAGE)).resolves.toBe('paper');
  });

  it('rejects a hung model call instead of leaving the step running', async () => {
    await expect(withStepTimeout(new Promise(() => {}), 15, STEP_TIMEOUT_MESSAGE)).rejects.toThrow(STEP_TIMEOUT_MESSAGE);
  });

  it('does not try another model after a timeout', () => {
    expect(shouldTryNextModel(new Error(STEP_TIMEOUT_MESSAGE))).toBe(false);
    expect(shouldTryNextModel(new Error('model missing'))).toBe(true);
  });

  it('keeps the model limit longer than a step that already succeeded', () => {
    expect(MODEL_STEP_TIMEOUT_MS).toBeGreaterThan(90_000);
    expect(MODEL_STEP_TIMEOUT_MS).toBeLessThan(RUNNING_GIVE_UP_MS);
  });
});

describe('nextResumeAlarm', () => {
  it('wakes the object again while any execution is still running', () => {
    expect(nextResumeAlarm([{ status: 'completed' }, { status: 'running' }], NOW)).toBe(NOW + RESUME_ALARM_MS);
  });

  it('sets no alarm once every execution has finished', () => {
    expect(nextResumeAlarm([{ status: 'completed' }, { status: 'failed' }], NOW)).toBeNull();
    expect(nextResumeAlarm([], NOW)).toBeNull();
  });

  it('wakes before a stranded step reaches the give-up limit', () => {
    expect(RESUME_ALARM_MS).toBeLessThan(RUNNING_GIVE_UP_MS - RUNNING_GRACE_MS);
  });
});
