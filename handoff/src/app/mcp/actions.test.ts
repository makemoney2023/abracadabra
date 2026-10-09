import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("notFound");
}));
const setPortalServer = vi.hoisted(() => vi.fn());
const gate = vi.hoisted(() => ({ admin: true }));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/current", () => ({
  requireHqSuperAdminPage: async () => {
    if (!gate.admin) notFound();
    return { sql: {}, caller: { userId: "admin-1", staff: { superAdmin: true }, operatorOf: [], memberships: [] } };
  },
}));

vi.mock("@/lib/portal-env", () => ({
  portalRuntime: () => ({ MCP_PORTAL_URL: "https://mcp.example/mcp", runSecret: "" }),
}));

vi.mock("@/lib/portal-session", () => ({
  setPortalServer: (...args: unknown[]) => setPortalServer(...args),
}));

import { revalidatePath } from "next/cache";
import { togglePortalServerAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  gate.admin = true;
  notFound.mockClear();
  setPortalServer.mockReset();
  vi.mocked(revalidatePath).mockClear();
});

describe("togglePortalServerAction", () => {
  it("refuses a caller who is not a super admin", async () => {
    gate.admin = false;
    await expect(togglePortalServerAction(form({ serverId: "handoff", enabled: "false" }))).rejects.toThrow("notFound");
    expect(setPortalServer).not.toHaveBeenCalled();
  });

  it("turns the posted server on or off", async () => {
    setPortalServer.mockResolvedValue({ ok: true, configured: true, servers: [] });
    await togglePortalServerAction(form({ serverId: "handoff", enabled: "false" }));
    expect(setPortalServer).toHaveBeenCalledWith(expect.anything(), { serverId: "handoff", enabled: false });
    expect(revalidatePath).toHaveBeenCalledWith("/mcp");
  });
});
