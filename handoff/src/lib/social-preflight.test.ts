import { describe, expect, it } from "vitest";
import { preflight, type PreflightAccount, type PreflightPiece } from "./social-preflight";
import type { PlannedMedia } from "./social-plan";

const picture = (key: string): PlannedMedia => ({ key, contentType: "image/png", role: "main", kind: "image" });
const video = (key: string): PlannedMedia => ({ key, contentType: "video/mp4", role: "main", kind: "video" });

function piece(partial: Partial<PreflightPiece> & Pick<PreflightPiece, "id" | "media">): PreflightPiece {
  return {
    version: 1,
    currentVersion: 1,
    title: partial.title ?? "Launch",
    format: partial.format ?? "static",
    approved: partial.approved ?? true,
    poster: partial.poster ?? null,
    youtubeTitle: partial.youtubeTitle,
    tags: partial.tags,
    firstComment: partial.firstComment,
    ...partial,
  };
}

const ig: PreflightAccount = { id: "ig", platform: "instagram", active: true };
const yt: PreflightAccount = { id: "yt", platform: "youtube", active: true };
const tt: PreflightAccount = { id: "tt", platform: "tiktok", active: true };

const NOW = 1_800_000_000_000;

describe("preflight", () => {
  it("requires explicit ids for both selection modes and never expands them", () => {
    const pieces = [piece({ id: "pic", media: [picture("a")] })];
    for (const mode of ["explicit", "eligible"] as const) {
      expect(preflight({ mode, itemIds: [], accountIds: ["ig"], pieces, accounts: [ig], live: [], timing: { kind: "draft" } })).toEqual({
        executable: [],
        blocked: [],
        warnings: [],
        reason: "selection_required",
      });
      expect(preflight({ mode, itemIds: ["pic"], accountIds: [], pieces, accounts: [ig], live: [], timing: { kind: "draft" } }).reason).toBe(
        "selection_required",
      );
    }
  });

  it("resolves static, carousel, reel, and short types per target", () => {
    const result = preflight({
      mode: "explicit",
      itemIds: ["pic", "slides", "clip"],
      accountIds: ["ig", "yt"],
      pieces: [
        piece({ id: "pic", media: [picture("a")] }),
        piece({ id: "slides", format: "carousel", media: [picture("s1"), picture("s2")] }),
        piece({ id: "clip", format: "video", media: [video("v")], title: "Clip" }),
      ],
      accounts: [ig, yt],
      live: [],
      timing: { kind: "scheduled", startAt: NOW + 120_000, gapMinutes: 60, now: NOW },
    });
    const row = (itemId: string, accountId: string) => result.executable.find((entry) => entry.itemId === itemId && entry.accountId === accountId);
    expect(row("pic", "ig")).toMatchObject({ postType: "feed", eligible: true, media: { count: 1, keys: ["a"] } });
    expect(row("slides", "ig")).toMatchObject({ postType: "carousel" });
    expect(row("clip", "ig")).toMatchObject({ postType: "reel" });
    expect(row("clip", "yt")).toMatchObject({ postType: "short", options: { title: "Clip" } });
    expect(row("pic", "yt")).toBeUndefined();
    expect(result.blocked.some((entry) => entry.itemId === "pic" && entry.accountId === "yt")).toBe(true);
    expect(result.executable.map((entry) => [entry.itemId, entry.accountId, entry.scheduleAt])).toEqual([
      ["pic", "ig", NOW + 120_000],
      ["slides", "ig", NOW + 3_720_000],
      ["clip", "ig", NOW + 7_320_000],
      ["clip", "yt", NOW + 7_320_000],
    ]);
  });

  it("blocks out of scope, disconnected, unapproved, stale, duplicate, and too-soon rows", () => {
    const result = preflight({
      mode: "eligible",
      itemIds: ["pic", "old", "open"],
      accountIds: ["pin", "dead", "ig"],
      pieces: [
        piece({ id: "pic", media: [picture("a")] }),
        piece({ id: "old", media: [picture("b")], version: 1, currentVersion: 2 }),
        piece({ id: "open", media: [picture("c")], approved: false }),
      ],
      accounts: [
        { id: "pin", platform: "pinterest", active: true },
        { id: "dead", platform: "instagram", active: false },
        ig,
      ],
      live: [{ itemId: "pic", version: 1, accountId: "ig" }],
      timing: { kind: "scheduled", startAt: NOW + 10_000, gapMinutes: 60, now: NOW },
    });
    const reason = (itemId: string, accountId: string) =>
      result.blocked.find((entry) => entry.itemId === itemId && entry.accountId === accountId)?.reason;
    expect(reason("pic", "pin")).toBe("out_of_scope");
    expect(reason("pic", "dead")).toBe("disconnected");
    expect(reason("old", "ig")).toBe("stale_version");
    expect(reason("open", "ig")).toBe("unapproved");
    expect(reason("pic", "ig")).toBe("duplicate");
    expect(result.executable).toHaveLength(0);

    const soon = preflight({
      mode: "explicit",
      itemIds: ["pic"],
      accountIds: ["ig"],
      pieces: [piece({ id: "pic", media: [picture("a")] })],
      accounts: [ig],
      live: [],
      timing: { kind: "scheduled", startAt: NOW + 10_000, gapMinutes: 60, now: NOW },
    });
    expect(soon.blocked[0]?.reason).toBe("too_soon");
  });

  it("allows an unapproved draft, warns on missing tags, and blocks a missing YouTube title", () => {
    const open = preflight({
      mode: "explicit",
      itemIds: ["open"],
      accountIds: ["ig"],
      pieces: [piece({ id: "open", media: [picture("a")], approved: false })],
      accounts: [ig],
      live: [],
      timing: { kind: "draft" },
    });
    expect(open.executable).toHaveLength(1);

    const titled = preflight({
      mode: "explicit",
      itemIds: ["clip"],
      accountIds: ["yt"],
      pieces: [piece({ id: "clip", format: "video", media: [video("v")], title: "Named", tags: [] })],
      accounts: [yt],
      live: [],
      timing: { kind: "draft" },
    });
    expect(titled.executable).toHaveLength(1);
    expect(titled.warnings).toEqual([{ itemId: "clip", accountId: "yt", reason: "missing_tags" }]);

    const blank = preflight({
      mode: "explicit",
      itemIds: ["clip"],
      accountIds: ["yt"],
      pieces: [piece({ id: "clip", format: "video", media: [video("v")], title: "", youtubeTitle: "" })],
      accounts: [yt],
      live: [],
      timing: { kind: "draft" },
    });
    expect(blank.blocked[0]?.reason).toBe("missing_title");
  });

  it("keeps TikTok in the inbox and rejects unsupported options and cadence clashes", () => {
    const tiktok = preflight({
      mode: "explicit",
      itemIds: ["clip"],
      accountIds: ["tt"],
      pieces: [piece({ id: "clip", format: "video", media: [video("v")] })],
      accounts: [tt],
      live: [],
      timing: { kind: "draft" },
      options: [{ itemId: "clip", accountId: "tt", options: { draft: false, surprise: true } }],
    });
    expect(tiktok.blocked[0]?.reason).toBe("unsupported_options");

    const inbox = preflight({
      mode: "explicit",
      itemIds: ["clip"],
      accountIds: ["tt"],
      pieces: [piece({ id: "clip", format: "video", media: [video("v")] })],
      accounts: [tt],
      live: [],
      timing: { kind: "draft" },
    });
    expect(inbox.executable[0]?.options).toMatchObject({ draft: true });

    const cadence = preflight({
      mode: "explicit",
      itemIds: ["pic"],
      accountIds: ["ig"],
      pieces: [piece({ id: "pic", media: [picture("a")] })],
      accounts: [ig],
      live: [],
      timing: { kind: "cadence", slots: [NOW + 3_600_000], takenSlots: [NOW + 3_600_000 + 30_000], now: NOW },
    });
    expect(cadence.blocked[0]?.reason).toBe("cadence_conflict");
  });

  it("does not call a network or object store", () => {
    const source = preflight.toString();
    expect(source).not.toMatch(/zernio|fetch\(|R2|openObjectStore/i);
  });
});
