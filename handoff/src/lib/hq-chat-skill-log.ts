/**
 * Staff chat (HqChat Durable Object) usage logging for search_skills and read_skill. The DO has no D1 binding, so it
 * posts each event to HQ's /api/hq-chat/skill-events with the staff member's chat token, inside waitUntil.
 * Best effort: any failure is swallowed and never breaks the chat.
 */

export type SkillToolEvent = { event: "search" | "read"; query?: string; path?: string; result_count?: number; status?: number };

export function searchEvent(query: string, result: { ok: boolean; skills?: unknown[] }): SkillToolEvent {
  return { event: "search", query: query.slice(0, 200), result_count: result.ok ? (result.skills?.length ?? 0) : 0, status: result.ok ? 200 : 503 };
}

export function readEvent(path: string, result: { ok: boolean; path?: string }): SkillToolEvent {
  return { event: "read", path: (result.ok && result.path ? result.path : path).slice(0, 400), status: result.ok ? 200 : 404 };
}

export async function postSkillEvent(
  origin: string,
  token: string,
  event: SkillToolEvent & { organization_id?: string; task_id?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!origin || !token) return;
  try {
    await fetchImpl(`${origin.replace(/\/$/, "")}/api/hq-chat/skill-events`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // Usage logging never breaks the chat.
  }
}
