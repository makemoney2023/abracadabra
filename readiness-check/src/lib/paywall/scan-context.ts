import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { BoundSql, CheckBindings } from "@/lib/cloudflare/sql";

export async function checkDb(): Promise<BoundSql | null> {
  return ((await getCloudflareContext({ async: true })).env as CheckBindings).DB ?? null;
}

export async function scanByToken(
  db: BoundSql,
  token: string,
): Promise<{ id: string; domain: string; status: string } | null> {
  return db
    .prepare("SELECT id, domain, status FROM readiness_scans WHERE public_token = ?")
    .bind(token)
    .first<{ id: string; domain: string; status: string }>();
}
