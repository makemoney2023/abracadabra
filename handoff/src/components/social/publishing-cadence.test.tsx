import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import {
  CADENCE_SENTENCE,
  approvalControlLabel,
  cadenceFingerprint,
  nextSlots,
  saveAutopost,
} from "@/lib/social-autopost";
import { defaultAgentPublishMode, saveAgentPublishMode } from "@/lib/social-policy-settings";
import { evaluateSocialPolicy } from "@/lib/social-policy";
import { DEFAULT_AUTOPOST } from "@/lib/social-autopost";

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };

describe("publishing cadence", () => {
  it("keeps the New York weekday slots when caps and blackouts are unset", () => {
    const monday = Date.UTC(2026, 10, 2, 12, 0);
    const settings = { ...DEFAULT_AUTOPOST, weekdays: [1, 3], times: ["09:00", "17:00"], timezone: "America/New_York" };
    const taken = [Date.UTC(2026, 10, 2, 22, 0)];
    expect(nextSlots(settings, taken, monday, 3)).toEqual([
      Date.UTC(2026, 10, 2, 14, 0),
      Date.UTC(2026, 10, 4, 14, 0),
      Date.UTC(2026, 10, 4, 22, 0),
    ]);
  });

  it("skips blackout dates and stops at the daily cap without skipping holidays on its own", () => {
    const monday = Date.UTC(2026, 10, 2, 12, 0);
    const settings = {
      ...DEFAULT_AUTOPOST,
      weekdays: [1, 2, 3, 4, 5],
      times: ["09:00", "17:00"],
      timezone: "America/New_York",
      blackouts: ["2026-11-02"],
      dailyCap: 1,
    };
    const slots = nextSlots(settings, [], monday, 3);
    const days = slots.map((at) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at),
    );
    expect(days).not.toContain("2026-11-02");
    expect(new Set(days).size).toBe(days.length);
    expect(slots).toHaveLength(3);
  });

  it("names the cadence on approve and invalidates a recommendation when the cadence changes", () => {
    expect(approvalControlLabel({ ...DEFAULT_AUTOPOST, enabled: false })).toBe("Approve");
    const on = {
      ...DEFAULT_AUTOPOST,
      enabled: true,
      weekdays: [1, 3],
      times: ["09:00"],
      timezone: "America/New_York",
    };
    expect(approvalControlLabel(on)).toContain("America/New_York");
    expect(approvalControlLabel(on)).toContain("09:00");
    expect(CADENCE_SENTENCE).toBe("When the client approves a piece, place it in the next available slot.");
    const fingerprint = cadenceFingerprint(on);
    expect(cadenceFingerprint({ ...on, times: ["10:00"] })).not.toBe(fingerprint);
  });

  it("defaults agent policy to draft and lets only staff grant it", async () => {
    expect(defaultAgentPublishMode()).toBe("draft");
    const hire = evaluateSocialPolicy(
      { kind: "agent", id: "hire-1", role: "hire", assigned: true, mode: "managed", grant: [], revoke: [] },
      "cadence_change",
    );
    expect(hire.authorization).toBe("denied");
    expect(hire.reasonCode).toBe("role_denied");
    const sql = sqliteSql(new DatabaseSync(":memory:"));
    await migrate(sql);
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`,
      [NOW, NOW],
    );
    const denied = await saveAgentPublishMode(sql, { kind: "client_owner", id: "c-1" }, "org-1", "managed", NOW);
    expect(denied).toEqual({ ok: false, reasonCode: "role_denied" });
    expect(await saveAgentPublishMode(sql, { kind: "staff", id: "staff-1" }, "org-1", "managed", NOW)).toEqual({ ok: true });
    const row = await sql.get<{ mode: string }>("SELECT mode FROM social_agent_policies WHERE organization_id = 'org-1'");
    expect(row?.mode).toBe("managed");
    const activity = await sql.get<{ data_json: string; kind: string }>(
      "SELECT kind, data_json FROM activities WHERE organization_id = 'org-1' AND kind = 'social.policy.updated'",
    );
    expect(activity?.kind).toBe("social.policy.updated");
    expect(activity?.data_json).not.toMatch(/caption|token|bearer|sk_/i);
    expect(JSON.parse(activity?.data_json ?? "{}")).toMatchObject({ mode: "managed" });
    const saved = await saveAutopost(
      sql,
      staff,
      "org-1",
      { enabled: true, accountIds: [], weekdays: [1], times: ["09:00"], timezone: "UTC" },
      NOW,
    );
    expect(saved.ok).toBe(false);
    const cadence = await saveAutopost(
      sql,
      staff,
      "org-1",
      { enabled: false, accountIds: [], weekdays: [1, 2, 3, 4, 5], times: ["09:00"], timezone: "UTC" },
      NOW,
    );
    expect(cadence).toEqual({ ok: true });
    const cadenceActivity = await sql.get<{ data_json: string }>(
      "SELECT data_json FROM activities WHERE kind = 'social.cadence.updated'",
    );
    expect(cadenceActivity?.data_json).not.toMatch(/caption|token|bearer/i);
  });
});
