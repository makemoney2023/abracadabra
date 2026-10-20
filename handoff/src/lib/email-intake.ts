import type { Sql } from "@/db/sql";
import { lookupEmailSender } from "@/lib/client-channel-store";
import { openEmailProspect } from "@/lib/prospect-lead";

/**
 * Inbound mail to hq@ / magic@ is log-only. handoff-agent parses the message and posts it here (action log_email on
 * /api/client-messages). Nothing is sent back. Each new message becomes an email.received activity, which the
 * Client Services feed carries as "New email from …". A known contact's mail lands on that client. An unknown person
 * opens a lead as before; a bulk or vendor sender (newsletters, no-reply, auto-generated) opens nothing.
 */

export type InboundEmailLog = {
  sender: string;
  name?: string | null;
  subject: string;
  text: string;
  messageId: string;
  threadId?: string;
  references?: string;
  listUnsubscribe?: string;
  listId?: string;
  precedence?: string;
  autoSubmitted?: string;
  authenticationResults?: string;
  attachments?: number;
};

export type InboundEmailResult =
  | { logged: true; duplicate: false; bulk: boolean; reasons: string[]; organizationId: string | null; leadCreated: boolean; activityId: string }
  | { logged: false; duplicate: true };

const NO_REPLY = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|notify|newsletters?|news|marketing|updates|digest|alerts?)([+._-].*)?$/i;

/** Why this looks like bulk or vendor mail. Empty means a person probably wrote it. */
export function bulkEmailReasons(input: Pick<InboundEmailLog, "sender" | "listUnsubscribe" | "listId" | "precedence" | "autoSubmitted">): string[] {
  const reasons: string[] = [];
  if (input.listUnsubscribe?.trim()) reasons.push("list-unsubscribe");
  if (input.listId?.trim()) reasons.push("list-id");
  const precedence = (input.precedence ?? "").trim().toLowerCase();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") reasons.push(`precedence: ${precedence}`);
  const auto = (input.autoSubmitted ?? "").trim().toLowerCase();
  if (auto && auto !== "no") reasons.push("auto-submitted");
  const local = input.sender.trim().toLowerCase().split("@")[0] ?? "";
  if (NO_REPLY.test(local)) reasons.push("no-reply sender");
  return reasons;
}

function clip(value: string | undefined | null, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function logInboundEmail(sql: Sql, input: InboundEmailLog, now: number): Promise<InboundEmailResult> {
  const sender = input.sender.trim().toLowerCase();
  const messageId = input.messageId.trim() || `${sender}:${clip(input.subject, 200)}:${now}`;
  const fresh = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM intake_receipts WHERE source = 'mailbox' AND external_id = ?", [messageId]);
  if (Number(fresh?.n ?? 0) > 0) return { logged: false, duplicate: true };
  await sql.run("INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('mailbox', ?, ?)", [messageId, now]);

  const reasons = bulkEmailReasons({ ...input, sender });
  const bulk = reasons.length > 0;
  let organizationId: string | null = null;
  let leadCreated = false;
  if (sender.includes("@")) {
    const known = await lookupEmailSender(sql, sender, input.authenticationResults ?? "");
    organizationId = known.organizationId;
    if (!organizationId && !bulk) {
      try {
        const opened = await openEmailProspect(sql, {
          email: sender,
          name: input.name?.trim() || null,
          now,
          text: input.text,
          subject: input.subject,
          threadId: input.threadId ?? null,
          references: input.references ?? null,
        });
        organizationId = opened.organizationId ?? null;
        leadCreated = opened.created === true;
      } catch {
        organizationId = null;
      }
    }
  }
  const subject = clip(input.subject, 200) || "(no subject)";
  const activityId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'email.received', 'system', 'mailbox', ?, ?, ?)`,
    [
      activityId,
      organizationId,
      `New email from ${sender || "an unknown sender"}: ${subject}`.slice(0, 500),
      JSON.stringify({
        from: sender,
        name: clip(input.name, 200) || null,
        subject,
        message_id: messageId,
        thread_id: input.threadId ?? null,
        snippet: clip(input.text, 500),
        attachments: input.attachments ?? 0,
        bulk,
        reasons,
        lead_created: leadCreated,
        replied: false,
      }),
      now,
    ],
  );
  return { logged: true, duplicate: false, bulk, reasons, organizationId, leadCreated, activityId };
}
