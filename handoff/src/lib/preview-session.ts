import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";

export const PREVIEW_EMAIL = "studio@handoff.local";
export const PREVIEW_SLUG = "northwind";

const PREVIEW_REQUESTS = [
  {
    position: 1,
    title: "Logo",
    guidance: "The mark as a PNG or SVG.",
    tag: "brand",
  },
  {
    position: 2,
    title: "Wordmark",
    guidance: "The name set in the brand type.",
    tag: "brand",
  },
] as const;

function randomHex(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Opens the studio locker in this browser. No magic link is created or sent. */
export async function openPreviewSession(input: {
  sql: Sql;
  now: number;
}): Promise<{ sessionToken: string; userId: string; slug: string }> {
  const existing = await input.sql.get<{ id: string }>("SELECT id FROM users WHERE email = ?", [
    PREVIEW_EMAIL,
  ]);
  const userId = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    await input.sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [
      userId,
      PREVIEW_EMAIL,
      input.now,
    ]);
  }

  const staff = await input.sql.get<{ user_id: string }>(
    "SELECT user_id FROM staff WHERE user_id = ?",
    [userId],
  );
  if (!staff) {
    await input.sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
       VALUES (?, ?, 1, ?, NULL)`,
      [userId, PREVIEW_EMAIL, input.now],
    );
  } else {
    await input.sql.run(
      "UPDATE staff SET is_super_admin = 1, revoked_at = NULL, email = ? WHERE user_id = ?",
      [PREVIEW_EMAIL, userId],
    );
  }

  const workspace = await input.sql.get<{ id: string }>(
    "SELECT id FROM workspaces WHERE slug = ?",
    [PREVIEW_SLUG],
  );
  if (!workspace) {
    const workspaceId = crypto.randomUUID();
    await input.sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
         quota_bytes, retention_days, request_digest, status, opened_at
       ) VALUES (?, ?, ?, ?, NULL, ?, 'standard', ?, ?, 0, 'active', ?)`,
      [
        workspaceId,
        PREVIEW_SLUG,
        "Northwind",
        "Northwind Studio",
        "Abracadabra",
        LIMITS.defaultQuotaBytes,
        LIMITS.defaultRetentionDays,
        input.now,
      ],
    );
    for (const item of PREVIEW_REQUESTS) {
      await input.sql.run(
        `INSERT INTO requests (
           id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'open', NULL, NULL)`,
        [crypto.randomUUID(), workspaceId, item.position, item.title, item.guidance, item.tag],
      );
    }
  }

  const sessionToken = randomHex();
  await input.sql.run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [
      crypto.randomUUID(),
      userId,
      await sha256Hex(sessionToken),
      input.now,
      input.now + LIMITS.sessionTtlMs,
    ],
  );
  return { sessionToken, userId, slug: PREVIEW_SLUG };
}
