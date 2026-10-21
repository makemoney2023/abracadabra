import Link from "next/link";
import { clock } from "@/lib/clock";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import {
  filingChoices,
  listAgentsForStaff,
  listClientGrants,
  publishedLabel,
  skillPacksFromIndex,
  suggestionClients,
  type AgentRow,
} from "@/lib/agent-admin";
import { skillUsageStats, usageWindow } from "@/lib/skill-usage";
import { suggestPacksForClient, type PackSuggestion } from "@/lib/skill-suggest";
import { SkillUsageCard } from "./skill-usage-card";
import { cfEnv } from "@/lib/client-services-auth";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import type { SkillBucket } from "@/lib/skill-library";
import { isLiveSuperAdmin } from "@/lib/store/staff";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageFrame } from "@/components/page-frame";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../staff-shell";
import {
  AssignAgentDrawer,
  GrantSkillsDrawer,
  RegisterAgentDrawer,
  RevokeSkillButton,
  RevokeTokenDrawer,
  RotateTokenDrawer,
  UnassignButton,
  HandOverButton,
} from "./agent-forms";

export const dynamic = "force-dynamic";

const STATUS: Record<AgentRow["status"], { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  active: { label: "Active", variant: "secondary" },
  idle: { label: "No clients", variant: "outline" },
  revoked: { label: "Revoked", variant: "destructive" },
};

export default async function AgentsPage({ searchParams }: { searchParams?: Promise<{ usage?: string }> }) {
  const { sql, caller } = await requireHqStaffPage();
  const query = (await searchParams) ?? {};
  const days = usageWindow(query.usage);
  const [agents, clientGrants, choices, packs, isAdmin] = await Promise.all([
    listAgentsForStaff(sql, caller),
    listClientGrants(sql, caller),
    filingChoices(sql),
    skillPacksFromIndex(cfEnv().SKILLS as SkillBucket | undefined),
    isLiveSuperAdmin(sql, caller),
  ]);
  const packList = packs.ok ? packs.packs : [];
  const packError = packs.ok ? null : packs.error;
  const clients = choices.clients;
  const now = clock();
  const [usage, suggestInputs] = await Promise.all([
    skillUsageStats(sql, {
      now,
      days,
      libraryPacks: packList.map((pack) => ({ prefix: pack.prefix, count: pack.count })),
      skillNames: packs.ok ? packs.skillNames : undefined,
    }),
    suggestionClients(sql, caller, clients.map((client) => client.id)),
  ]);
  const granted = new Map(clientGrants.map((grant) => [grant.organizationId, grant.prefixes]));
  const suggestions: Record<string, PackSuggestion[]> = {};
  for (const client of suggestInputs) suggestions[client.id] = suggestPacksForClient(client, packList, 6, granted.get(client.id) ?? []);
  const published = packs.ok ? publishedLabel(packs.manifest?.published_at) : null;
  const librarySummary = packs.ok
    ? ` ${packList.length} packs · ${packs.skillCount} skills · ${published ? `published ${published}` : "publish date unknown"}.`
    : ` ${packError}`;
  const agentsMode = !legacyStartsAllowed();

  const columns: Column<AgentRow>[] = [
    {
      key: "agent",
      header: "Agent",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <Badge variant={STATUS[row.status].variant}>{STATUS[row.status].label}</Badge>,
    },
    {
      key: "assignments",
      header: "Clients",
      cell: (row) =>
        row.assignments.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {row.assignments.map((item) => (
              <li key={item.organizationId} className="flex flex-wrap items-center gap-1.5 text-sm">
                <Link className="underline-offset-4 hover:underline" href={`/clients/${item.organizationId}?tab=agents`}>
                  {item.organizationName}
                </Link>
                <Badge variant={item.role === "lead" ? "default" : "outline"}>{item.role === "lead" ? "Lead" : "Hire"}</Badge>
                {item.spaceName ? <span className="text-xs text-muted-foreground">{item.spaceName}</span> : null}
                {item.projectName ? <span className="text-xs text-muted-foreground">· {item.projectName}</span> : null}
                <UnassignButton agentId={row.id} organizationId={item.organizationId} organizationName={item.organizationName} />
                {item.role === "lead" && agentsMode ? (
                  <HandOverButton organizationId={item.organizationId} organizationName={item.organizationName} />
                ) : null}
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "skills",
      header: "Extra skills",
      cell: (row) =>
        row.grants.length === 0 ? (
          <span className="text-muted-foreground">Client packs only</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {row.grants.map((prefix) => (
              <li key={prefix} className="flex items-center gap-1 font-mono text-xs">
                {prefix}
                <RevokeSkillButton prefix={prefix} agentId={row.id} />
              </li>
            ))}
          </ul>
        ),
    },
    { key: "filed", header: "Filed", align: "right", cell: (row) => row.filedCount },
    {
      key: "lastActivity",
      header: "Last activity",
      cell: (row) => (row.lastActivity == null ? <span className="text-muted-foreground">Never</span> : formatRelative(row.lastActivity, now)),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <AssignAgentDrawer agentId={row.id} clients={clients} />
          <GrantSkillsDrawer scope="agent" agentId={row.id} packs={packList} packError={packError} />
          {isAdmin ? <RotateTokenDrawer agentId={row.id} revoked={row.status === "revoked"} /> : null}
          {isAdmin && row.status !== "revoked" ? <RevokeTokenDrawer agentId={row.id} /> : null}
        </div>
      ),
    },
  ];

  return (
    <StaffShell>
      <PageFrame
        width="wide"
        title="Agents"
        description="Client agents, the clients they work for, and the skill packs they can read. Client Services usually does this; use it to check or fix."
        actions={<RegisterAgentDrawer clients={clients} isAdmin={isAdmin} />}
      >
        <div className="flex flex-col gap-6">
          <DataTable
            columns={columns}
            rows={agents}
            rowKey={(row) => row.id}
            empty={
              <EmptyState
                title="No agents yet"
                body={isAdmin ? "Register a client's agent to issue its token." : "An admin or Client Services registers agents."}
              />
            }
          />
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Client skill packs</CardTitle>
                <CardDescription>
                  Granted per client by default, so every agent on that client can read them.
                  {librarySummary}
                </CardDescription>
              </div>
              {clients.length ? (
                <GrantSkillsDrawer
                  scope="client"
                  clients={clients.map((client) => ({ id: client.id, name: client.name }))}
                  packs={packList}
                  packError={packError}
                  suggestions={suggestions}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {clientGrants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No client has skill packs yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {clientGrants.map((grant) => (
                    <li key={grant.organizationId} className="flex flex-col gap-1 text-sm">
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/clients/${grant.organizationId}?tab=agents`}>
                        {grant.name}
                      </Link>
                      <ul className="flex flex-wrap gap-1.5">
                        {grant.prefixes.map((prefix) => (
                          <li key={prefix} className="flex items-center gap-0.5 rounded-md border border-border px-1.5 font-mono text-xs">
                            {prefix}
                            <RevokeSkillButton prefix={prefix} organizationId={grant.organizationId} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <SkillUsageCard stats={usage} now={now} />
        </div>
      </PageFrame>
    </StaffShell>
  );
}
