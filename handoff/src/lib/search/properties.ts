import { organizationById } from "@/db/crm";
import type { Sql, SqlStatement } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { searchConsoleConfig, type SearchConsoleEnv } from "./config";
import { describeSearchError, isSearchApiError } from "./errors";
import { sharedTokenProvider } from "./google-auth";
import { createGscClient, type GscClient, type SiteEntry } from "./gsc";

/** Staff map a Search Console property to one client. Access is checked by the handoff Worker's hourly cron. */

export type SearchPropertyStatus = "pending" | "active" | "access_lost" | "paused" | "removed";

export type SearchProperty = {
  id: string;
  organization_id: string;
  provider: "gsc" | "ga4";
  site_url: string;
  status: SearchPropertyStatus;
  permission_level: string | null;
  inspect_budget: number;
  loop_enabled: number;
  backfill_state: "none" | "running" | "done" | "failed";
  data_through: string | null;
  last_checked_at: number | null;
  last_success_at: number | null;
  last_error: string | null;
  mapped_by: string | null;
  created_at: number;
  updated_at: number;
};

const COLUMNS =
  "id, organization_id, provider, site_url, status, permission_level, inspect_budget, loop_enabled, backfill_state, data_through, last_checked_at, last_success_at, last_error, mapped_by, created_at, updated_at";

/** Google returns this level for a property the account cannot actually read. */
const UNUSABLE_LEVELS = new Set(["siteUnverifiedUser"]);

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Canonical property id, or null. Accepts `sc-domain:example.com`, `https://www.example.com/` (path kept, trailing slash
 * added), and a bare `example.com` (taken as the domain property). Hosts are lowercased.
 */
export function normalizeSiteUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^sc-domain:/i.test(value)) {
    const host = value.slice("sc-domain:".length).trim().toLowerCase();
    return HOST.test(host) ? `sc-domain:${host}` : null;
  }
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.username || url.password || url.search || url.hash || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!HOST.test(host)) return null;
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return `${url.protocol}//${host}${path}`;
  }
  const host = value.toLowerCase();
  return HOST.test(host) ? `sc-domain:${host}` : null;
}

export async function listSearchProperties(sql: Sql, organizationId: string): Promise<SearchProperty[]> {
  return sql.all<SearchProperty>(
    `SELECT ${COLUMNS} FROM search_properties WHERE organization_id = ? AND status <> 'removed' ORDER BY created_at`,
    [organizationId],
  );
}

type MapError = "invalid" | "missing" | "taken" | "duplicate";

export async function mapSearchProperty(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; siteUrl: string; now: number },
): Promise<{ ok: true; property: SearchProperty } | { ok: false; error: MapError }> {
  const organization = await organizationById(sql, caller, input.organizationId);
  if (!organization || !caller.userId) return { ok: false, error: "missing" };
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  if (!siteUrl) return { ok: false, error: "invalid" };
  const existing = await sql.get<{ organization_id: string }>(
    "SELECT organization_id FROM search_properties WHERE provider = 'gsc' AND site_url = ? AND status <> 'removed'",
    [siteUrl],
  );
  if (existing) return { ok: false, error: existing.organization_id === input.organizationId ? "duplicate" : "taken" };
  const id = crypto.randomUUID();
  await sql.batch([
    {
      statement: `INSERT INTO search_properties (id, organization_id, provider, site_url, status, mapped_by, created_at, updated_at)
                  VALUES (?, ?, 'gsc', ?, 'pending', ?, ?, ?)`,
      params: [id, input.organizationId, siteUrl, caller.userId, input.now, input.now],
    },
    searchActivity(input.organizationId, "search.property_mapped", "staff", caller.userId, `Mapped Search Console property ${siteUrl}.`, { property_id: id, site_url: siteUrl }, input.now),
  ]);
  const property = await sql.get<SearchProperty>(`SELECT ${COLUMNS} FROM search_properties WHERE id = ?`, [id]);
  return property ? { ok: true, property } : { ok: false, error: "missing" };
}

export async function removeSearchProperty(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; propertyId: string; now: number },
): Promise<{ ok: true } | { ok: false; error: "missing" }> {
  const organization = await organizationById(sql, caller, input.organizationId);
  if (!organization || !caller.userId) return { ok: false, error: "missing" };
  const row = await sql.get<{ site_url: string }>(
    "SELECT site_url FROM search_properties WHERE id = ? AND organization_id = ? AND status <> 'removed'",
    [input.propertyId, input.organizationId],
  );
  if (!row) return { ok: false, error: "missing" };
  await sql.batch([
    {
      statement: "UPDATE search_properties SET status = 'removed', updated_at = ? WHERE id = ?",
      params: [input.now, input.propertyId],
    },
    searchActivity(input.organizationId, "search.property_unmapped", "staff", caller.userId, `Removed Search Console property ${row.site_url}.`, { property_id: input.propertyId, site_url: row.site_url }, input.now),
  ]);
  return { ok: true };
}

// ---------- Access check (handoff Worker cron) ----------

/** Google returns siteUnverifiedUser for a property the account cannot actually read. */
export function readableSites(sites: SiteEntry[]): Map<string, string> {
  return new Map(sites.filter((site) => !UNUSABLE_LEVELS.has(site.permissionLevel)).map((site) => [site.siteUrl, site.permissionLevel]));
}

export const ACCESS_SETTING_KEY = "search_console_access";

export type AccessCheck = {
  checkedAt: number;
  ok: boolean;
  /** off | missing_key | invalid_key | a SearchApiError kind. Absent when ok. */
  reason?: string;
  /** The service-account email clients add in Search Console. Not a secret. */
  clientEmail?: string;
  /** Properties the service account can see, with Google's permission level. */
  sites?: SiteEntry[];
};

export async function readAccessCheck(sql: Sql): Promise<AccessCheck | null> {
  const row = await sql.get<{ value: string }>("SELECT value FROM agent_settings WHERE key = ?", [ACCESS_SETTING_KEY]);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as AccessCheck;
    return parsed && typeof parsed.checkedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

async function saveAccessCheck(sql: Sql, check: AccessCheck): Promise<void> {
  await sql.run(
    `INSERT INTO agent_settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [ACCESS_SETTING_KEY, JSON.stringify(check)],
  );
}

/**
 * Hourly on the handoff Worker. With Search Console off or the key missing it records why and stops (fail closed,
 * no Google call). Otherwise one sites.list call: mapped properties the account can read become active; an active one
 * that disappeared becomes access_lost (the client removed us); a pending one stays pending. Never throws.
 */
export async function refreshSearchAccess(input: {
  sql: Sql;
  env: SearchConsoleEnv | undefined | null;
  now: number;
  fetchImpl?: typeof fetch;
  client?: GscClient;
}): Promise<AccessCheck> {
  const { sql, now } = input;
  const config = searchConsoleConfig(input.env);
  if (!config.ok) {
    const check: AccessCheck = { checkedAt: now, ok: false, reason: config.reason };
    // Off stays quiet: write only when the reason changes, not every hour.
    const previous = await readAccessCheck(sql);
    if (!previous || previous.ok || previous.reason !== config.reason) await saveAccessCheck(sql, check);
    return check;
  }
  const client = input.client ?? createGscClient({ tokens: sharedTokenProvider(config.key, input.fetchImpl), fetchImpl: input.fetchImpl });
  let sites: SiteEntry[];
  try {
    sites = await client.listSites();
  } catch (error) {
    const check: AccessCheck = {
      checkedAt: now,
      ok: false,
      reason: isSearchApiError(error) ? error.kind : "network",
      clientEmail: config.key.clientEmail,
    };
    await saveAccessCheck(sql, check);
    await sql.run(
      `UPDATE search_properties SET last_checked_at = ?, last_error = ?, consecutive_failures = consecutive_failures + 1
       WHERE provider = 'gsc' AND status IN ('pending', 'active', 'access_lost')`,
      [now, describeSearchError(error)],
    );
    return check;
  }
  const visible = readableSites(sites);
  const mapped = await sql.all<{ id: string; organization_id: string; site_url: string; status: SearchPropertyStatus }>(
    "SELECT id, organization_id, site_url, status FROM search_properties WHERE provider = 'gsc' AND status IN ('pending', 'active', 'access_lost')",
  );
  for (const property of mapped) {
    const level = visible.get(property.site_url);
    if (level) {
      const statements: SqlStatement[] = [
        {
          statement: `UPDATE search_properties SET status = 'active', permission_level = ?, last_checked_at = ?, last_success_at = ?,
                      last_error = NULL, consecutive_failures = 0, updated_at = ? WHERE id = ?`,
          params: [level, now, now, now, property.id],
        },
      ];
      if (property.status !== "active") {
        const kind = property.status === "access_lost" ? "search.access_restored" : "search.access_confirmed";
        const body = property.status === "access_lost"
          ? `Search Console access is back for ${property.site_url}.`
          : `HQ can read Search Console property ${property.site_url}.`;
        statements.push(searchActivity(property.organization_id, kind, "system", null, body, { property_id: property.id, site_url: property.site_url, permission_level: level }, now));
      }
      await sql.batch(statements);
    } else if (property.status === "active") {
      await sql.batch([
        {
          statement: `UPDATE search_properties SET status = 'access_lost', permission_level = NULL, last_checked_at = ?,
                      last_error = 'not_shared', updated_at = ? WHERE id = ?`,
          params: [now, now, property.id],
        },
        searchActivity(
          property.organization_id,
          "search.access_lost",
          "system",
          null,
          `HQ lost Search Console access to ${property.site_url}. The client needs to add ${config.key.clientEmail} again.`,
          { property_id: property.id, site_url: property.site_url },
          now,
        ),
      ]);
    } else {
      await sql.run("UPDATE search_properties SET last_checked_at = ?, last_error = 'not_shared' WHERE id = ?", [now, property.id]);
    }
  }
  const check: AccessCheck = { checkedAt: now, ok: true, clientEmail: config.key.clientEmail, sites };
  await saveAccessCheck(sql, check);
  return check;
}

/** The hourly cron (`0 * * * *`) on the handoff Worker checks access. Any other cron, or any error, is a no-op. */
export const SEARCH_ACCESS_CRON = "0 * * * *";

export async function runSearchAccessCron(input: {
  sql: Sql;
  env: SearchConsoleEnv | undefined | null;
  cron: string;
  now: number;
  fetchImpl?: typeof fetch;
  client?: GscClient;
}): Promise<void> {
  if (input.cron !== SEARCH_ACCESS_CRON) return;
  try {
    await refreshSearchAccess(input);
  } catch (error) {
    console.error(describeSearchError(error));
  }
}

/** An org-scoped activities row (the audit trail for search). */
export function searchActivity(
  organizationId: string,
  kind: string,
  actorKind: "staff" | "system",
  actorId: string | null,
  body: string,
  data: Record<string, unknown>,
  now: number,
): SqlStatement {
  return {
    statement: `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), organizationId, kind, actorKind, actorId, body, JSON.stringify(data), now],
  };
}
