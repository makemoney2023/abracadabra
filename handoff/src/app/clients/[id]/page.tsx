import { notFound } from "next/navigation";
import { listClientThreads } from "@/db/conversations";
import {
  STATUS_HEALTHS,
  latestAssessment,
  listContacts,
  listDeals,
  listBoard,
  listBoardActivity,
  openCloudRunCount,
  listOpenTasks,
  listOrganizations,
  listProjects,
  listRepos,
  listTimeline,
  organizationById,
  presentAssessment,
  unlinkedWorkspaces,
  type StatusHealth,
} from "@/db/crm";
import { latestSchemaScan } from "@/db/schema-checks";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { initials } from "@/lib/format";
import { listVisibleRepos } from "@/lib/github/app";
import { readGithubSecrets } from "@/lib/github/secrets";
import { presentSchemaLead } from "@/lib/schema-report";
import { statusToken } from "@/lib/status-token";
import { listUnassignedSwarmRuns } from "@/lib/swarm-runs";
import { SetContextLabel } from "@/components/context-bar";
import { PageFrame } from "@/components/page-frame";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { StaffShell } from "../../staff-shell";
import { TIMELINE_PAGE_SIZE } from "./activity-tab";
import { ClientActions } from "./client-actions";
import { ClientBody } from "./client-body";
import { ClientTabs } from "./client-tabs";
import { CLIENT_KIND_LABEL, activeTab } from "./tabs";

function asHealth(value: string): StatusHealth | null {
  return (STATUS_HEALTHS as readonly string[]).includes(value) ? (value as StatusHealth) : null;
}

function pageNumber(raw: string | undefined): number {
  const value = Number(raw ?? "1");
  if (!Number.isInteger(value) || value < 1) return 1;
  return value;
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; merged?: string; tab?: string; project?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const projectFilter = query.project ?? "";
  const tab = activeTab(query.tab);
  const page = tab === "activity" ? pageNumber(query.page) : 1;
  const { sql, caller } = await requireHqStaffPage();
  const client = await organizationById(sql, caller, id);
  if (!client) notFound();
  const [
    free,
    linked,
    contacts,
    tasks,
    timeline,
    orgs,
    deals,
    projects,
    repos,
    threads,
    storedCheck,
    schemaScan,
    healthRow,
    cards,
    activity,
    capRow,
    opens,
    runsOpen,
    unassignedRuns,
  ] = await Promise.all([
    unlinkedWorkspaces(sql, caller),
    sql.all<{ id: string; slug: string; display_name: string }>(
      `SELECT id, slug, display_name FROM workspaces
       WHERE organization_id = ? AND status != 'purged'
       ORDER BY display_name`,
      [client.id],
    ),
    listContacts(sql, caller, client.id),
    listOpenTasks(sql, caller, client.id),
    listTimeline(sql, caller, client.id, TIMELINE_PAGE_SIZE, (page - 1) * TIMELINE_PAGE_SIZE),
    listOrganizations(sql, caller),
    listDeals(sql, caller, { organizationId: client.id }),
    listProjects(sql, caller, client.id),
    listRepos(sql, caller, client.id),
    listClientThreads(sql, client.id),
    latestAssessment(sql, caller, client.id),
    latestSchemaScan(sql, client.id),
    sql.get<{ health: string }>(
      `SELECT health FROM status_updates
       WHERE organization_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [client.id],
    ),
    listBoard(sql, caller, {
      organizationId: client.id,
      projectId: projectFilter && projectFilter !== "none" ? projectFilter : undefined,
      unassigned: projectFilter === "none",
      hideInactiveProjects: projectFilter === "" || projectFilter === "none",
    }),
    listBoardActivity(sql, caller, [client.id]),
    sql.get<{ value: string }>("SELECT value FROM agent_settings WHERE key = 'max_cloud_runs'"),
    sql.all<{ project_id: string | null; open: number }>(
      `SELECT project_id, COUNT(*) AS open FROM tasks
       WHERE organization_id = ? AND status != 'done'
       GROUP BY project_id`,
      [client.id],
    ),
    openCloudRunCount(sql, caller),
    listUnassignedSwarmRuns(sql, caller, client.id),
  ]);
  const secrets = readGithubSecrets();
  const visible = secrets ? await listVisibleRepos({ secrets, fetch, now: clock() }) : null;
  const choices = visible?.ok
    ? visible.value.flatMap((install) =>
        install.suspended ? [] : install.repos.map((repo) => ({ id: repo.id, fullName: repo.fullName })),
      )
    : [];
  const health = healthRow ? asHealth(healthRow.health) : null;
  const owners = contacts.slice(0, 3);
  return (
    <StaffShell>
      <SetContextLabel path={`/clients/${client.id}`} label={client.name} />
      <PageFrame
        width="wide"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{client.name}</span>
            <Badge variant="secondary">{CLIENT_KIND_LABEL[client.kind]}</Badge>
            {health ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-normal">
                <StatusDot domain="health" value={health} />
                {statusToken("health", health).label}
              </span>
            ) : null}
            {owners.map((person) => (
              <span
                key={person.id}
                className="flex size-7 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-normal"
              >
                {initials(person.name)}
              </span>
            ))}
          </span>
        }
        description={client.website ?? undefined}
        actions={<ClientActions organizationId={client.id} spaces={free} />}
      >
        {query.merged === "1" ? <p role="status" className="text-sm">These clients are now one.</p> : null}
        <ClientTabs clientId={client.id} tab={tab} />
        <ClientBody
          tab={tab}
          page={page}
          client={client}
          contacts={contacts}
          tasks={tasks}
          cards={cards}
          activity={activity}
          now={clock()}
          projectId={projectFilter}
          runCap={capRow && Number.isFinite(Number(capRow.value)) ? Number(capRow.value) : null}
          runsOpen={runsOpen}
          opens={opens.map((row) => ({ projectId: row.project_id, open: Number(row.open) }))}
          timeline={timeline}
          linked={linked}
          free={free}
          repos={repos}
          deals={deals}
          projects={projects}
          unassignedRuns={unassignedRuns}
          threads={threads}
          readiness={storedCheck ? presentAssessment(storedCheck) : null}
          schema={schemaScan ? presentSchemaLead(schemaScan) : null}
          choices={choices}
          others={orgs.filter((org) => org.id !== client.id).map((org) => ({ id: org.id, name: org.name }))}
          githubConnected={Boolean(secrets)}
          githubFailed={Boolean(secrets && visible && !visible.ok)}
        />
      </PageFrame>
    </StaffShell>
  );
}
