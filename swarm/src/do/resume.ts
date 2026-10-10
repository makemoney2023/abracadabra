import type { NodeResult } from '../types';

/** A status poll inside this window must not start the step over. */
export const RUNNING_GRACE_MS = 120_000;

/** A running step older than this is stopped even on its first attempt. */
export const RUNNING_GIVE_UP_MS = 180_000;

/**
 * Workers AI has no request timeout. A paper step has finished in about 91s,
 * so the cap sits above that and below the give-up backstop.
 */
export const MODEL_STEP_TIMEOUT_MS = 170_000;

export const STEP_TIMEOUT_MESSAGE = 'The step timed out.';

export type ResumeAction = 'done' | 'error' | 'in-flight' | 'retry' | 'give-up';

/** Decide what a persisted node should do when a new isolate wakes the run. */
export function classifyResume(prior: Pick<NodeResult, 'status' | 'startedAt' | 'attempts'>, now: number): ResumeAction {
  if (prior.status === 'done') return 'done';
  if (prior.status === 'error') return 'error';
  if (prior.status !== 'running') return 'retry';
  if (prior.startedAt == null) return 'give-up';
  const age = now - prior.startedAt;
  if (age >= RUNNING_GIVE_UP_MS) return 'give-up';
  if (age < RUNNING_GRACE_MS) return 'in-flight';
  if ((prior.attempts ?? 1) >= 2) return 'give-up';
  return 'retry';
}

/** A timed-out model call must not fall through to the next model. That would wait out the cap again. */
export function shouldTryNextModel(error: unknown): boolean {
  return !(error instanceof Error && error.message === STEP_TIMEOUT_MESSAGE);
}

/** Fail the model call if it does not finish, so the node can be marked and the chain can continue. */
export function withStepTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
