import type { GithubSecrets } from "./app";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type QueueBinding = { send(body: unknown): Promise<void> };

type CloudflareEnv = {
  GITHUB_EVENTS?: QueueBinding;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_WEBHOOK_SECRET?: string;
};

function cloudflareEnv(): CloudflareEnv {
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: CloudflareEnv };
  };
  return holder[CLOUDFLARE_CONTEXT]?.env ?? {};
}

function readEnv(name: "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY" | "GITHUB_WEBHOOK_SECRET"): string {
  const fromProcess = process.env[name]?.trim() ?? "";
  if (fromProcess) return fromProcess;
  const value = cloudflareEnv()[name];
  return typeof value === "string" ? value.trim() : "";
}

/** Webhook checks need only this secret, not the app id or key. */
export function githubWebhookSecret(): string {
  return readEnv("GITHUB_WEBHOOK_SECRET");
}

export function githubEventsQueue(): QueueBinding | undefined {
  return cloudflareEnv().GITHUB_EVENTS;
}

/** Null when any of the three Worker secrets is missing. */
export function readGithubSecrets(): GithubSecrets | null {
  const appId = readEnv("GITHUB_APP_ID");
  const privateKey = readEnv("GITHUB_APP_PRIVATE_KEY");
  const webhookSecret = readEnv("GITHUB_WEBHOOK_SECRET");
  if (!appId || !privateKey || !webhookSecret) return null;
  return { appId, privateKey, webhookSecret };
}
