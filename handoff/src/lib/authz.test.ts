import { describe, expect, it } from "vitest";
import { can, type Action, type Caller } from "./authz";

const WORKSPACE = "workspace-a";
const OTHER = "workspace-b";

const superAdmin: Caller = {
  userId: "super",
  staff: { superAdmin: true },
  operatorOf: [],
  memberships: [],
};

const operator: Caller = {
  userId: "operator",
  staff: { superAdmin: false },
  operatorOf: [WORKSPACE],
  memberships: [],
};

const unassigned: Caller = {
  userId: "other-operator",
  staff: { superAdmin: false },
  operatorOf: [OTHER],
  memberships: [],
};

const owner: Caller = {
  userId: "owner",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_owner" }],
};

const member: Caller = {
  userId: "member",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_member" }],
};

const stranger: Caller = {
  userId: "stranger",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: OTHER, role: "client_owner" }],
};

const signedOut: Caller = {
  userId: null,
  staff: null,
  operatorOf: [],
  memberships: [],
};

const matrix: { action: Action; allowed: [boolean, boolean, boolean, boolean] }[] = [
  { action: "workspace.view", allowed: [true, true, true, true] },
  { action: "workspace.create", allowed: [true, false, false, false] },
  { action: "workspace.configure", allowed: [true, false, false, false] },
  { action: "invite.owner", allowed: [true, true, false, false] },
  { action: "invite.member", allowed: [true, true, true, false] },
  { action: "share.copy", allowed: [true, true, true, false] },
  { action: "knowledge.manage", allowed: [true, true, true, false] },
  { action: "member.remove", allowed: [true, true, true, false] },
  { action: "request.manage", allowed: [true, true, false, false] },
  { action: "batch.create", allowed: [false, false, true, true] },
  { action: "file.download", allowed: [true, true, true, true] },
  { action: "batch.discard", allowed: [true, true, true, true] },
  { action: "file.tag", allowed: [true, true, false, false] },
  { action: "batch.export", allowed: [true, true, false, false] },
  { action: "batch.delete", allowed: [true, true, false, false] },
  { action: "file.release", allowed: [true, false, false, false] },
  { action: "workspace.archive", allowed: [true, true, false, false] },
  { action: "workspace.export", allowed: [true, false, false, false] },
  { action: "workspace.purge", allowed: [true, false, false, false] },
];

const roles = [superAdmin, operator, owner, member] as const;

describe("can", () => {
  it.each(matrix)("$action matches the HND-006 columns", ({ action, allowed }) => {
    const target =
      action === "workspace.create"
        ? {}
        : action === "batch.discard"
          ? { workspaceId: WORKSPACE, batchCreatedBy: "owner-or-member" }
          : { workspaceId: WORKSPACE };
    roles.forEach((caller, index) => {
      const batchTarget =
        action === "batch.discard"
          ? { workspaceId: WORKSPACE, batchCreatedBy: caller.userId ?? undefined }
          : target;
      expect(can(caller, action, batchTarget)).toBe(allowed[index]);
    });
  });

  it("hides a workspace from an unassigned operator", () => {
    expect(can(unassigned, "workspace.view", { workspaceId: WORKSPACE })).toBe(false);
    expect(can(unassigned, "file.download", { workspaceId: WORKSPACE })).toBe(false);
    expect(can(unassigned, "share.copy", { workspaceId: WORKSPACE })).toBe(false);
  });

  it("hides workspace A from a client of workspace B", () => {
    expect(can(stranger, "workspace.view", { workspaceId: WORKSPACE })).toBe(false);
    expect(can(stranger, "batch.create", { workspaceId: WORKSPACE })).toBe(false);
  });

  it("lets a client discard only a batch they created", () => {
    expect(
      can(member, "batch.discard", { workspaceId: WORKSPACE, batchCreatedBy: "someone-else" }),
    ).toBe(false);
    expect(
      can(member, "batch.discard", { workspaceId: WORKSPACE, batchCreatedBy: "member" }),
    ).toBe(true);
  });

  it("lets an admin who belongs to a folder upload there", () => {
    const studio: Caller = {
      userId: "studio",
      staff: { superAdmin: true },
      operatorOf: [],
      memberships: [{ workspaceId: WORKSPACE, role: "client_owner" }],
    };
    expect(can(studio, "workspace.create")).toBe(true);
    expect(can(studio, "batch.create", { workspaceId: WORKSPACE })).toBe(true);
    expect(can(studio, "share.copy", { workspaceId: WORKSPACE })).toBe(true);
    expect(can(superAdmin, "batch.create", { workspaceId: WORKSPACE })).toBe(false);
    expect(can(superAdmin, "share.copy", { workspaceId: WORKSPACE })).toBe(true);
  });

  it("treats a revoked membership as no membership", () => {
    expect(can(signedOut, "workspace.view", { workspaceId: WORKSPACE })).toBe(false);
  });
});
