import { lookupSender, lookupSenders } from "@/db/conversations";
import type { Sql } from "@/db/sql";
import { emailAuthenticated } from "./client-channel";

export async function lookupEmailSender(sql: Sql, email: string, authenticationResults: string): Promise<{
  organizationId: string | null;
  organizations: { id: string; name: string; kind: string }[];
  authenticated: boolean;
}> {
  const organizations = await lookupSenders(sql, email);
  const organizationId = organizations[0]?.id ?? (await lookupSender(sql, email));
  return { organizationId, organizations, authenticated: emailAuthenticated(authenticationResults, email) };
}
