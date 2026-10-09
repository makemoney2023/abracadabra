import { lookupSender, lookupSenders } from "@/db/conversations";
import type { Sql } from "@/db/sql";
import { emailAuthenticated } from "./client-channel";

export async function lookupEmailSender(sql: Sql, email: string, authenticationResults: string): Promise<{
  organizationId: string | null;
  organizations: { id: string; name: string; kind: string }[];
  authenticated: boolean;
  optedOut: boolean;
}> {
  const organizations = await lookupSenders(sql, email);
  const organizationId = organizations[0]?.id ?? (await lookupSender(sql, email));
  const address = email.trim().toLowerCase();
  const opted = address
    ? await sql.get<{ id: string }>("SELECT id FROM contacts WHERE lower(email) = ? AND opted_out = 1 LIMIT 1", [address])
    : undefined;
  return {
    organizationId,
    organizations,
    authenticated: emailAuthenticated(authenticationResults, email),
    optedOut: Boolean(opted),
  };
}

/** Stops mailbox replies for this address only. The lead, deal, and files stay. */
export async function markOptedOut(sql: Sql, email: string, now: number): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) return;
  await sql.run("UPDATE contacts SET opted_out = 1, updated_at = ? WHERE lower(email) = ?", [now, address]);
  const contact = await sql.get<{ organization_id: string | null }>(
    "SELECT organization_id FROM contacts WHERE lower(email) = ? LIMIT 1",
    [address],
  );
  if (!contact?.organization_id) return;
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, 'agent.note', 'agent', 'client-desk', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      contact.organization_id,
      "This address opted out of mailbox replies.",
      JSON.stringify({ email: address }),
      now,
    ],
  );
}
