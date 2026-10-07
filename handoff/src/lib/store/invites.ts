import type { Sql } from "@/db/sql";
import { can, type Caller, type MembershipRole } from "@/lib/authz";
import { LIMITS } from "@/lib/policy/limits";
import { normalizeEmail, requestMagicLink, type OutboundMail } from "@/lib/session";
import { renderInviteEmail } from "@/lib/email-templates";
import { REFUSED, type StoreResult } from "@/lib/store/result";

const ALREADY_OPEN = "That invite is already out.";
const LIMIT_REACHED = "You've sent as many invites as you can today.";
const MAIL_FAILED = "We couldn't send the email. Please try again soon.";
const DIFFERENT_EMAIL = "This invite was sent to a different email.";
const INVALID = "That invite doesn't work anymore.";

const DAY_MS = 24 * 60 * 60 * 1000;

type MailInput = {
  origin: string;
  from: string;
  allowlist: readonly string[];
  send: (message: OutboundMail) => Promise<void>;
};

function roleOf(value: string): MembershipRole | undefined {
  return value === "client_owner" || value === "client_member" ? value : undefined;
}

function inviteTtlMs(): number {
  return LIMITS.inviteTtlDays * DAY_MS;
}

async function liveInviteGrant(
  sql: Sql,
  caller: Caller,
  workspaceId: string,
  role: MembershipRole,
): Promise<boolean> {
  const action = role === "client_owner" ? "invite.owner" : "invite.member";
  if (!caller.userId || !can(caller, action, { workspaceId })) return false;
  if (caller.staff?.superAdmin) {
    const row = await sql.get<{ ok: number }>(
      "SELECT 1 AS ok FROM staff WHERE user_id = ? AND is_super_admin = 1 AND revoked_at IS NULL",
      [caller.userId],
    );
    if (row?.ok === 1) return true;
  }
  if (caller.staff) {
    const row = await sql.get<{ ok: number }>(
      `SELECT 1 AS ok FROM staff s
       JOIN workspace_operators o ON o.user_id = s.user_id
       WHERE s.user_id = ? AND s.revoked_at IS NULL AND o.workspace_id = ? AND o.removed_at IS NULL`,
      [caller.userId, workspaceId],
    );
    if (row?.ok === 1) return true;
  }
  if (role === "client_member") {
    const row = await sql.get<{ ok: number }>(
      `SELECT 1 AS ok FROM memberships
       WHERE user_id = ? AND workspace_id = ? AND role = 'client_owner' AND revoked_at IS NULL`,
      [caller.userId, workspaceId],
    );
    if (row?.ok === 1) return true;
  }
  return false;
}

async function sendInviteLink(
  sql: Sql,
  email: string,
  inviteId: string,
  workspaceId: string,
  now: number,
  mail: MailInput,
): Promise<boolean> {
  const workspace = await sql.get<{ display_name: string }>(
    "SELECT display_name FROM workspaces WHERE id = ?",
    [workspaceId],
  );
  const before = await sql.get<{ n: number }>("SELECT count(*) AS n FROM magic_links WHERE email = ?", [email]);
  try {
    await requestMagicLink({
      sql,
      email,
      now,
      origin: mail.origin,
      from: mail.from,
      allowlist: mail.allowlist,
      returnTo: `/invites/${inviteId}`,
      compose: (url) => {
        const rendered = renderInviteEmail({
          from: mail.from,
          to: email,
          spaceName: workspace?.display_name ?? "",
          url,
        });
        return { subject: rendered.subject, text: rendered.text, html: rendered.html };
      },
      send: mail.send,
    });
  } catch {
    return false;
  }
  const after = await sql.get<{ n: number }>("SELECT count(*) AS n FROM magic_links WHERE email = ?", [email]);
  return (after?.n ?? 0) > (before?.n ?? 0);
}

export async function createInvite(input: {
  sql: Sql;
  caller: Caller;
  workspaceId: string;
  email: string;
  role: string;
  now: number;
} & MailInput): Promise<StoreResult<{ id: string }>> {
  const role = roleOf(input.role);
  const email = normalizeEmail(input.email);
  if (!role || !email || !input.caller.userId) return { ok: false, message: REFUSED };
  if (!(await liveInviteGrant(input.sql, input.caller, input.workspaceId, role))) {
    return { ok: false, message: REFUSED };
  }
  const workspace = await input.sql.get<{ status: string }>(
    "SELECT status FROM workspaces WHERE id = ?",
    [input.workspaceId],
  );
  if (workspace?.status !== "active") return { ok: false, message: REFUSED };

  const open = await input.sql.get<{ id: string }>(
    "SELECT id FROM invites WHERE workspace_id = ? AND email = ? AND revoked_at IS NULL",
    [input.workspaceId, email],
  );
  if (open) return { ok: false, message: ALREADY_OPEN };

  const threshold = input.now - DAY_MS + inviteTtlMs();
  const recent = await input.sql.get<{ n: number }>(
    "SELECT count(*) AS n FROM invites WHERE invited_by = ? AND expires_at > ?",
    [input.caller.userId, threshold],
  );
  if ((recent?.n ?? 0) >= LIMITS.invitesPerInviterPerDay) {
    return { ok: false, message: LIMIT_REACHED };
  }

  const id = crypto.randomUUID();
  await input.sql.run(
    `INSERT INTO invites (id, workspace_id, email, role, invited_by, expires_at, accepted_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [id, input.workspaceId, email, role, input.caller.userId, input.now + inviteTtlMs()],
  );
  const sent = await sendInviteLink(input.sql, email, id, input.workspaceId, input.now, input);
  if (!sent) {
    await input.sql.run("DELETE FROM invites WHERE id = ?", [id]);
    return { ok: false, message: MAIL_FAILED };
  }
  return { ok: true, value: { id } };
}

export async function resendInvite(input: {
  sql: Sql;
  caller: Caller;
  inviteId: string;
  now: number;
} & MailInput): Promise<StoreResult<{ id: string }>> {
  const invite = await input.sql.get<{
    id: string;
    workspace_id: string;
    email: string;
    role: string;
    revoked_at: number | null;
    accepted_at: number | null;
  }>(
    "SELECT id, workspace_id, email, role, revoked_at, accepted_at FROM invites WHERE id = ?",
    [input.inviteId],
  );
  const role = invite ? roleOf(invite.role) : undefined;
  if (!invite || !role || invite.revoked_at !== null || invite.accepted_at !== null) {
    return { ok: false, message: INVALID };
  }
  if (!(await liveInviteGrant(input.sql, input.caller, invite.workspace_id, role))) {
    return { ok: false, message: REFUSED };
  }
  const workspace = await input.sql.get<{ status: string }>(
    "SELECT status FROM workspaces WHERE id = ?",
    [invite.workspace_id],
  );
  if (workspace?.status !== "active") return { ok: false, message: INVALID };
  const sent = await sendInviteLink(input.sql, invite.email, invite.id, invite.workspace_id, input.now, input);
  if (!sent) return { ok: false, message: MAIL_FAILED };
  await input.sql.run("UPDATE invites SET expires_at = ? WHERE id = ?", [input.now + inviteTtlMs(), invite.id]);
  return { ok: true, value: { id: invite.id } };
}

export async function acceptInvite(input: {
  sql: Sql;
  caller: Caller;
  inviteId: string;
  now: number;
}): Promise<StoreResult<{ workspaceId: string }>> {
  if (!input.caller.userId) return { ok: false, message: INVALID };
  const invite = await input.sql.get<{
    email: string;
    role: string;
    workspace_id: string;
    expires_at: number;
    accepted_at: number | null;
    revoked_at: number | null;
    status: string;
  }>(
    `SELECT i.email, i.role, i.workspace_id, i.expires_at, i.accepted_at, i.revoked_at, w.status
     FROM invites i
     JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.id = ?`,
    [input.inviteId],
  );
  if (
    !invite ||
    invite.revoked_at !== null ||
    invite.accepted_at !== null ||
    invite.expires_at <= input.now ||
    invite.status !== "active"
  ) {
    return { ok: false, message: INVALID };
  }
  const user = await input.sql.get<{ email: string }>("SELECT email FROM users WHERE id = ?", [
    input.caller.userId,
  ]);
  if (!user) return { ok: false, message: INVALID };
  if (user.email !== invite.email) return { ok: false, message: DIFFERENT_EMAIL };
  const role = roleOf(invite.role);
  if (!role) return { ok: false, message: INVALID };
  await input.sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [crypto.randomUUID(), invite.workspace_id, input.caller.userId, user.email, role, input.now],
  );
  await input.sql.run("UPDATE invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL", [
    input.now,
    input.inviteId,
  ]);
  return { ok: true, value: { workspaceId: invite.workspace_id } };
}

export async function removeMember(input: {
  sql: Sql;
  caller: Caller;
  membershipId: string;
  now: number;
}): Promise<StoreResult<{ id: string }>> {
  const membership = await input.sql.get<{
    id: string;
    workspace_id: string;
    role: string;
    revoked_at: number | null;
  }>("SELECT id, workspace_id, role, revoked_at FROM memberships WHERE id = ?", [input.membershipId]);
  const role = membership ? roleOf(membership.role) : undefined;
  if (!membership || !role || membership.revoked_at !== null) return { ok: false, message: REFUSED };
  const action = role === "client_owner" ? "invite.owner" : "member.remove";
  if (!can(input.caller, action, { workspaceId: membership.workspace_id })) {
    return { ok: false, message: REFUSED };
  }
  if (!(await liveInviteGrant(input.sql, input.caller, membership.workspace_id, role === "client_owner" ? "client_owner" : "client_member"))) {
    return { ok: false, message: REFUSED };
  }
  await input.sql.run("UPDATE memberships SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [
    input.now,
    membership.id,
  ]);
  return { ok: true, value: { id: membership.id } };
}

export async function livePeople(
  sql: Sql,
  workspaceId: string,
): Promise<{
  members: { id: string; email: string; role: string }[];
  invites: { id: string; email: string; role: string }[];
}> {
  const members = await sql.all<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM memberships
     WHERE workspace_id = ? AND revoked_at IS NULL
     ORDER BY email`,
    [workspaceId],
  );
  const invites = await sql.all<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM invites
     WHERE workspace_id = ? AND revoked_at IS NULL AND accepted_at IS NULL
     ORDER BY email`,
    [workspaceId],
  );
  return { members, invites };
}
