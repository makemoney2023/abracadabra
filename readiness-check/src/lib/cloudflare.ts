export const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

const COPIED_ENV = [
  "PARALLEL_API_KEY",
  "CAL_WEBHOOK_SECRET",
  "CHECK_OPS_PASSWORD",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_CHECK_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CAL_LINK",
] as const;

export type QueueBinding = {
  send(body: unknown): Promise<void>;
};

export type WorkerEnv = {
  DB?: unknown;
  SCAN_JOBS?: QueueBinding;
  LEAD_INTAKE?: QueueBinding;
  PARALLEL_API_KEY?: string;
  CAL_WEBHOOK_SECRET?: string;
  CHECK_OPS_PASSWORD?: string;
  TURNSTILE_SECRET_KEY?: string;
  NEXT_PUBLIC_CHECK_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_CAL_LINK?: string;
};

type ContextHolder = typeof globalThis & {
  [CLOUDFLARE_CONTEXT]?: { env?: WorkerEnv };
};

export function workerEnv(): WorkerEnv {
  return (globalThis as ContextHolder)[CLOUDFLARE_CONTEXT]?.env ?? {};
}

/** Queue and cron handlers do not get OpenNext's fetch env copy. */
export function bindWorkerEnv(env: WorkerEnv): void {
  (globalThis as ContextHolder)[CLOUDFLARE_CONTEXT] = { env };
  for (const key of COPIED_ENV) {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      process.env[key] = value;
    }
  }
}
