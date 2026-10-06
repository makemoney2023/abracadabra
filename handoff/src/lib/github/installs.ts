import type { Sql } from "@/db/sql";

type Suspension = "leave" | "set" | "clear";

function accountOk(accountType: string): accountType is "User" | "Organization" {
  return accountType === "User" || accountType === "Organization";
}

/** Upsert an install. `leave` does not change suspension. `set` stamps now. `clear` removes it. */
export async function saveInstallation(
  sql: Sql,
  input: {
    id: number;
    accountLogin: string;
    accountType: string;
    now: number;
    suspension: Suspension;
  },
): Promise<void> {
  const login = input.accountLogin.trim();
  if (!accountOk(input.accountType) || login.length === 0 || login.length > 100) return;
  const insertedSuspension = input.suspension === "set" ? input.now : null;
  await sql.run(
    `INSERT INTO github_installations (
       id, account_login, account_type, organization_id, suspended_at, created_at
     ) VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_login = excluded.account_login,
       account_type = excluded.account_type,
       suspended_at = CASE
         WHEN ? = 'set' THEN ?
         WHEN ? = 'clear' THEN NULL
         ELSE github_installations.suspended_at
       END`,
    [input.id, login, input.accountType, insertedSuspension, input.now, input.suspension, input.now, input.suspension],
  );
}

/** Settings page cache. A repeat view keeps the first suspended time. */
export async function rememberInstallations(
  sql: Sql,
  installs: { id: number; accountLogin: string; accountType: string; suspended: boolean }[],
  now: number,
): Promise<void> {
  for (const install of installs) {
    const login = install.accountLogin.trim();
    if (!accountOk(install.accountType) || login.length === 0 || login.length > 100) continue;
    const suspended = install.suspended ? 1 : 0;
    await sql.run(
      `INSERT INTO github_installations (
         id, account_login, account_type, organization_id, suspended_at, created_at
       ) VALUES (?, ?, ?, NULL, CASE WHEN ? = 1 THEN ? ELSE NULL END, ?)
       ON CONFLICT(id) DO UPDATE SET
         account_login = excluded.account_login,
         account_type = excluded.account_type,
         suspended_at = CASE
           WHEN ? = 1 THEN COALESCE(github_installations.suspended_at, ?)
           ELSE NULL
         END`,
      [install.id, login, install.accountType, suspended, now, now, suspended, now],
    );
  }
}
