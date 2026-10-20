"use client";

import * as React from "react";
import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilingChoices, SkillPack } from "@/lib/agent-admin";
import {
  assignAgentAction,
  grantSkillsAction,
  registerAgentAction,
  revokeAgentAction,
  revokeSkillAction,
  rotateAgentAction,
  unassignAgentAction,
} from "./actions";
import { TokenActionForm } from "./token-reveal";

export const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

type Clients = FilingChoices["clients"];

/** Client → space, then the client's projects. The value is "<orgId>:<spaceId>" (space may be blank). */
function ClientSpaceFields({ clients, defaultOrg, allowNoSpace }: { clients: Clients; defaultOrg?: string; allowNoSpace?: boolean }) {
  const first = clients.find((client) => client.id === defaultOrg) ?? clients[0];
  const [org, setOrg] = React.useState(first?.id ?? "");
  const client = clients.find((entry) => entry.id === org);
  const initial = allowNoSpace ? `${first?.id ?? ""}:` : `${first?.id ?? ""}:${first?.spaces[0]?.id ?? ""}`;
  return (
    <>
      <ActionField name="target" label="Client and space">
        <select
          name="target"
          required
          className={selectClass}
          defaultValue={initial}
          onChange={(event) => setOrg(event.currentTarget.value.split(":")[0] ?? "")}
        >
          {clients.map((entry) => (
            <optgroup key={entry.id} label={entry.name}>
              {allowNoSpace ? <option value={`${entry.id}:`}>{entry.name} (any space)</option> : null}
              {entry.spaces.map((space) => (
                <option key={space.id} value={`${entry.id}:${space.id}`}>
                  {entry.name} · {space.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </ActionField>
      <ActionField name="projectId" label="Project (optional)">
        <select name="projectId" className={selectClass} defaultValue="" key={org}>
          <option value="">The space&apos;s project</option>
          {(client?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </ActionField>
    </>
  );
}

function RoleField() {
  return (
    <ActionField name="role" label="Role">
      <select name="role" className={selectClass} defaultValue="lead">
        <option value="lead">Lead (gets build, run, and change requests)</option>
        <option value="hire">Hire (works tasks it&apos;s given)</option>
      </select>
    </ActionField>
  );
}

export function RegisterAgentDrawer({ clients, isAdmin }: { clients: Clients; isAdmin: boolean }) {
  if (!isAdmin) return null;
  return (
    <FormDrawer title="Register an agent" description="Creates the agent, assigns it to a client, and issues its token once." trigger={<Button>Register agent</Button>}>
      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a client with an active space first.</p>
      ) : (
        <TokenActionForm action={registerAgentAction} submitLabel="Register and issue token" pendingLabel="Registering">
          <ActionField name="agentId" label="Agent id">
            <Input name="agentId" required pattern="[a-z0-9-]{2,64}" placeholder="acme-lead" autoComplete="off" />
          </ActionField>
          <ActionField name="label" label="Name">
            <Input name="label" required maxLength={200} placeholder="Acme lead agent" />
          </ActionField>
          <AssignFieldsForRegister clients={clients} />
          <RoleField />
        </TokenActionForm>
      )}
    </FormDrawer>
  );
}

function AssignFieldsForRegister({ clients }: { clients: Clients }) {
  const [org, setOrg] = React.useState(clients[0]?.id ?? "");
  const client = clients.find((entry) => entry.id === org);
  return (
    <>
      <ActionField name="organizationId" label="Client">
        <select name="organizationId" required className={selectClass} value={org} onChange={(event) => setOrg(event.currentTarget.value)}>
          {clients.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </ActionField>
      <ActionField name="workspaceId" label="Space (optional)">
        <select name="workspaceId" className={selectClass} defaultValue="" key={`s-${org}`}>
          <option value="">Pick per filing</option>
          {(client?.spaces ?? []).map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </ActionField>
      <ActionField name="projectId" label="Project (optional)">
        <select name="projectId" className={selectClass} defaultValue="" key={`p-${org}`}>
          <option value="">Any open project</option>
          {(client?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </ActionField>
    </>
  );
}

export function AssignAgentDrawer({ agentId, clients }: { agentId: string; clients: Clients }) {
  return (
    <FormDrawer title={`Assign ${agentId}`} description="Adds a client, or updates its role, space, and project." trigger={<Button variant="outline" size="sm">Assign</Button>}>
      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No client has an active space yet.</p>
      ) : (
        <ActionForm action={assignAgentAction} submitLabel="Save assignment" pendingLabel="Saving">
          <input type="hidden" name="agentId" value={agentId} />
          <ClientSpaceFields clients={clients} allowNoSpace />
          <RoleField />
        </ActionForm>
      )}
    </FormDrawer>
  );
}

export function UnassignButton({ agentId, organizationId, organizationName }: { agentId: string; organizationId: string; organizationName: string }) {
  return (
    <FormDrawer
      title={`Unassign from ${organizationName}`}
      description="The agent stops reading and filing for this client. Work it already filed stays."
      trigger={
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
          Unassign
        </Button>
      }
    >
      <ActionForm action={unassignAgentAction} submitLabel="Unassign" pendingLabel="Unassigning">
        <input type="hidden" name="agentId" value={agentId} />
        <input type="hidden" name="organizationId" value={organizationId} />
      </ActionForm>
    </FormDrawer>
  );
}

export function RotateTokenDrawer({ agentId, revoked }: { agentId: string; revoked: boolean }) {
  return (
    <FormDrawer
      title={revoked ? `Reissue a token for ${agentId}` : `Rotate ${agentId}'s token`}
      description="Issues a new token and stops the old one right away. The new token shows once."
      trigger={<Button variant="outline" size="sm">{revoked ? "Reissue token" : "Rotate token"}</Button>}
    >
      <TokenActionForm action={rotateAgentAction} submitLabel="Issue new token" pendingLabel="Issuing">
        <input type="hidden" name="agentId" value={agentId} />
      </TokenActionForm>
    </FormDrawer>
  );
}

export function RevokeTokenDrawer({ agentId }: { agentId: string }) {
  return (
    <FormDrawer
      title={`Revoke ${agentId}`}
      description="Its token stops working now. Assignments and filed work stay. Rotate to bring it back."
      trigger={<Button variant="outline" size="sm">Revoke</Button>}
    >
      <ActionForm action={revokeAgentAction} submitLabel="Revoke token" pendingLabel="Revoking">
        <input type="hidden" name="agentId" value={agentId} />
      </ActionForm>
    </FormDrawer>
  );
}

function PackPicker({ packs, packError }: { packs: SkillPack[]; packError: string | null }) {
  return (
    <>
      {packError ? <p className="text-sm text-muted-foreground">{packError} Type a path below instead.</p> : null}
      {packs.length ? (
        <fieldset className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
          <legend className="px-1 text-sm font-medium">Skill packs</legend>
          {packs.map((pack) => (
            <label key={pack.prefix} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="prefixes" value={pack.prefix} />
              <span className="font-mono text-xs">{pack.prefix}</span>
              <span className="text-muted-foreground">{pack.count} skills</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <ActionField name="prefixes" label="Other paths (optional)">
        <Input name="custom" placeholder="community/marketingskills/ or a path/SKILL.md" />
      </ActionField>
    </>
  );
}

export function GrantSkillsDrawer({
  scope,
  agentId,
  clients,
  packs,
  packError,
  trigger,
}: {
  scope: "client" | "agent";
  agentId?: string;
  clients?: { id: string; name: string }[];
  packs: SkillPack[];
  packError: string | null;
  trigger?: React.ReactElement;
}) {
  return (
    <FormDrawer
      title={scope === "client" ? "Grant skills to a client" : `Extra skills for ${agentId}`}
      description={scope === "client" ? "Every agent on that client can read these packs. This is the default." : "Only this agent gets these, on top of its clients' packs."}
      trigger={trigger ?? <Button variant="outline" size="sm">{scope === "client" ? "Grant to a client" : "Extra skills"}</Button>}
    >
      <ActionForm action={grantSkillsAction} submitLabel="Grant" pendingLabel="Granting">
        <input type="hidden" name="scope" value={scope} />
        {agentId ? <input type="hidden" name="agentId" value={agentId} /> : null}
        {scope === "client" ? (
          <ActionField name="organizationId" label="Client">
            <select name="organizationId" required className={selectClass}>
              {(clients ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </ActionField>
        ) : null}
        <PackPicker packs={packs} packError={packError} />
      </ActionForm>
    </FormDrawer>
  );
}

export function RevokeSkillButton({ prefix, agentId, organizationId }: { prefix: string; agentId?: string; organizationId?: string }) {
  return (
    <FormDrawer
      title="Remove grant"
      description={`Stops access to ${prefix}.`}
      trigger={
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" aria-label={`Remove ${prefix}`}>
          ×
        </Button>
      }
    >
      <ActionForm action={revokeSkillAction} submitLabel="Remove" pendingLabel="Removing">
        <input type="hidden" name="prefix" value={prefix} />
        {agentId ? <input type="hidden" name="agentId" value={agentId} /> : null}
        {organizationId ? <input type="hidden" name="organizationId" value={organizationId} /> : null}
      </ActionForm>
    </FormDrawer>
  );
}
