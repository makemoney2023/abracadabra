export type MembershipRole = "client_owner" | "client_member";

export type Caller = {
  userId: string | null;
  staff: { superAdmin: boolean } | null;
  operatorOf: string[];
  memberships: { workspaceId: string; role: MembershipRole }[];
};

export type Action =
  | "workspace.view"
  | "workspace.create"
  | "workspace.configure"
  | "workspace.archive"
  | "workspace.export"
  | "workspace.purge"
  | "invite.owner"
  | "invite.member"
  | "share.copy"
  | "member.remove"
  | "request.manage"
  | "batch.create"
  | "batch.discard"
  | "batch.delete"
  | "batch.export"
  | "file.download"
  | "file.tag"
  | "file.release"
  | "knowledge.manage";

export type AuthzTarget = {
  workspaceId?: string;
  batchCreatedBy?: string;
};

function workspaceIdOf(target: AuthzTarget): string | undefined {
  return target.workspaceId;
}

function isSuper(caller: Caller): boolean {
  return caller.staff?.superAdmin === true;
}

function isAssignedOperator(caller: Caller, workspaceId: string | undefined): boolean {
  return workspaceId !== undefined && caller.operatorOf.includes(workspaceId);
}

function membership(caller: Caller, workspaceId: string | undefined) {
  if (!workspaceId) return undefined;
  return caller.memberships.find((row) => row.workspaceId === workspaceId);
}

function seesWorkspace(caller: Caller, workspaceId: string | undefined): boolean {
  if (!workspaceId) return false;
  return isSuper(caller) || isAssignedOperator(caller, workspaceId) || membership(caller, workspaceId) !== undefined;
}

function staffOnWorkspace(caller: Caller, workspaceId: string | undefined): boolean {
  return isSuper(caller) || isAssignedOperator(caller, workspaceId);
}

/** HND-006. A missing workspace id only allows workspace creation by a super-admin. */
export function can(caller: Caller, action: Action, target: AuthzTarget = {}): boolean {
  const workspaceId = workspaceIdOf(target);
  const owner = membership(caller, workspaceId)?.role === "client_owner";
  const client = membership(caller, workspaceId) !== undefined;

  switch (action) {
    case "workspace.create":
      return isSuper(caller);
    case "workspace.view":
    case "file.download":
      return seesWorkspace(caller, workspaceId);
    case "workspace.configure":
    case "workspace.export":
    case "workspace.purge":
    case "file.release":
      return isSuper(caller);
    case "workspace.archive":
    case "invite.owner":
    case "request.manage":
    case "batch.delete":
    case "batch.export":
    case "file.tag":
      return staffOnWorkspace(caller, workspaceId);
    case "invite.member":
    case "share.copy":
    case "member.remove":
    case "knowledge.manage":
      return staffOnWorkspace(caller, workspaceId) || owner;
    case "batch.create":
      return client;
    case "batch.discard":
      if (staffOnWorkspace(caller, workspaceId)) return true;
      return client && caller.userId !== null && caller.userId === target.batchCreatedBy;
    default:
      return false;
  }
}
