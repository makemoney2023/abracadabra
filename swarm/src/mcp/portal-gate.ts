import type { McpServerConfig } from '../types';

export type PortalHeaderEnv = {
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
};

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

/** True only when the bearer matches the run secret. A missing secret never allows the portal. */
export async function portalAllowed(authorization: string | null, secret: string | undefined): Promise<boolean> {
  const expected = secret?.trim() ?? '';
  if (!expected) return false;
  const provided = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '')?.[1] ?? '';
  const [left, right] = await Promise.all([sha256(provided), sha256(expected)]);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

/** Drop the portal server unless this run presented the secret. */
export function serversForRun(servers: McpServerConfig[], allowed: boolean): McpServerConfig[] {
  if (allowed) return servers;
  return servers.filter((server) => server.id !== 'portal');
}

/** Access headers for the portal. Saved headers on that id are ignored. */
export function headersFor(
  server: McpServerConfig,
  env: PortalHeaderEnv,
  allowed: boolean,
): Record<string, string> | undefined {
  if (server.id !== 'portal') return server.headers;
  if (!allowed) return undefined;
  const id = env.CF_ACCESS_CLIENT_ID?.trim() ?? '';
  const secret = env.CF_ACCESS_CLIENT_SECRET?.trim() ?? '';
  if (!id || !secret) return undefined;
  return {
    'CF-Access-Client-Id': id,
    'CF-Access-Client-Secret': secret,
  };
}
