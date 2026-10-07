import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("notFound");
}));
const createInvite = vi.hoisted(() => vi.fn());
const resendInvite = vi.hoisted(() => vi.fn());
const headerValue = vi.hoisted(() => ({ host: "hq.abra-ca-dabra.app", proto: "https" }));
const visible = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; slug: string }>,
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name === "x-forwarded-host" || name === "host") return headerValue.host;
      if (name === "x-forwarded-proto") return headerValue.proto;
      return null;
    },
  }),
}));

vi.mock("@/lib/current", () => ({
  openSession: async () => ({
    sql: {},
    caller: { userId: "user-1", staff: { superAdmin: true }, operatorOf: [], memberships: [] },
  }),
}));

vi.mock("@/db/records", () => ({
  workspacesFor: async () => visible.rows,
}));

vi.mock("@/lib/store/invites", () => ({
  createInvite: (...args: unknown[]) => createInvite(...args),
  resendInvite: (...args: unknown[]) => resendInvite(...args),
  removeMember: vi.fn(),
}));

vi.mock("@/lib/mail", () => ({
  sendHandoffMail: vi.fn(),
}));

vi.mock("@/lib/store/staff", () => ({
  parseAllowlist: () => [],
}));

import { invitePersonAction, resendInviteAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  notFound.mockClear();
  createInvite.mockReset();
  resendInvite.mockReset();
  visible.rows = [];
  headerValue.host = "hq.abra-ca-dabra.app";
  process.env.HANDOFF_APP_ORIGIN = "https://handoff.abra-ca-dabra.app";
  process.env.HANDOFF_FROM_EMAIL = "magic@abra-ca-dabra.app";
});

describe("invitePersonAction", () => {
  it("stays on the form when the workspace is not visible", async () => {
    const result = await invitePersonAction(
      { message: "" },
      form({ slug: "strongfoam", email: "ada@example.com", role: "client_member" }),
    );

    expect(result).toEqual({ message: "Sign in again to do that." });
    expect(notFound).not.toHaveBeenCalled();
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("sends the invite link on the client host", async () => {
    visible.rows = [{ id: "ws-1", slug: "strongfoam" }];
    createInvite.mockResolvedValue({ ok: true, value: { id: "invite-1" } });

    const result = await invitePersonAction(
      { message: "" },
      form({ slug: "strongfoam", email: "ada@example.com", role: "client_member" }),
    );

    expect(result).toEqual({ message: "Invited." });
    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        email: "ada@example.com",
        origin: "https://handoff.abra-ca-dabra.app",
      }),
    );
    const origin = String(createInvite.mock.calls[0]?.[0]?.origin ?? "");
    expect(origin).not.toContain("hq.");
  });
});

describe("resendInviteAction", () => {
  it("resends on the client host", async () => {
    visible.rows = [{ id: "ws-1", slug: "strongfoam" }];
    resendInvite.mockResolvedValue({ ok: true, value: { id: "invite-1" } });

    const result = await resendInviteAction(
      { message: "" },
      form({ slug: "strongfoam", inviteId: "invite-1" }),
    );

    expect(result).toEqual({ message: "Sent again." });
    expect(resendInvite).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "https://handoff.abra-ca-dabra.app" }),
    );
  });
});
