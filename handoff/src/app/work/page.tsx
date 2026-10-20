import Link from "next/link";
import { listBoard, listBoardActivity, listBoardAgents, boardClientChips, listProjects, openCloudRunCount } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { isLiveSuperAdmin } from "@/lib/store/staff";
import { PageFrame } from "@/components/page-frame";
import { StaffShell } from "../staff-shell";
import { boardSwarmExtras } from "@/lib/board-swarm";
import { WorkBoard } from "./board";
import { ClientRequests } from "./client-requests";
import { listPendingWorkRequests } from "@/lib/client-work";
import { WorkToolbar } from "./filters";
import { filterWork, workCounts, workHref } from "./query";

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ late?: string; week?: string; blocked?: string; review?: string; client?: string; project?: string; agent?: string }>;
}) {
  const query = await searchParams;
  const late = query.late === "1";
  const week = query.week === "1";
  const blocked = query.blocked === "1";
  const review = query.review === "1";
  const client = query.client ?? "";
  const project = query.project ?? "";
  const agent = query.agent?.trim().toLowerCase() ?? "";
  const { sql, caller } = await requireHqStaffPage();
  const now = clock();
  const [cards, chips, projects, capRow, runsOpen, swarm, pending] = await Promise.all([
    listBoard(sql, caller, {
      organizationId: client || undefined,
      projectId: project && project !== "none" ? project : undefined,
      unassigned: project === "none",
      hideInactiveProjects: project === "" || project === "none",
      agentId: agent || undefined,
    }),
    boardClientChips(sql, caller),
    client ? listProjects(sql, caller, client) : Promise.resolve([]),
    sql.get<{ value: string }>("SELECT value FROM agent_settings WHERE key = 'max_cloud_runs'"),
    openCloudRunCount(sql, caller),
    boardSwarmExtras(sql),
    listPendingWorkRequests(sql).catch(() => []),
  ]);
  const open = cards.filter((card) => card.status !== "done");
  const counts = workCounts(open, now);
  const filtered = late || week || blocked || review;
  const visible = filtered
    ? filterWork(open, { late, week, blocked, review }, now)
    : cards;
  const orgIds = [...new Set(visible.map((card) => card.organization_id))];
  const [activity, agents] = await Promise.all([
    listBoardActivity(sql, caller, orgIds),
    listBoardAgents(sql, caller, client ? [client] : [...new Set([...orgIds, ...chips.map((chip) => chip.id)])]),
  ]);
  const agentChips = [...new Map(agents.map((row) => [row.id, row])).values()];
  const runCap = capRow ? Number(capRow.value) : null;
  const reviewOverride = await isLiveSuperAdmin(sql, caller);
  const scope = { late, week, blocked, review, client: client || undefined };
  const agentScope = { ...scope, project: project || undefined };

  return (
    <StaffShell>
      <PageFrame title="Work" description="Cards for every client: To do, Doing, Waiting on Client Services, and Done. Client Services approves a card or sends it back.">
        <ClientRequests rows={pending} />
        <WorkToolbar late={late} week={week} blocked={blocked} review={review} client={client || undefined} project={project || undefined} agent={agent || undefined} counts={counts} />
        <div className="flex flex-wrap gap-2">
          <Link href={workHref({ late, week, blocked, review })} className={client ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
            All clients
          </Link>
          {chips.map((chip) => (
            <Link
              key={chip.id}
              href={workHref({ ...scope, client: chip.id })}
              className={chip.id === client ? "text-sm font-medium" : "text-sm text-muted-foreground"}
            >
              {chip.name} · {chip.open}
            </Link>
          ))}
        </div>
        {client ? (
          <div className="flex flex-wrap gap-2">
            <Link href={workHref(scope)} className={project ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
              All projects
            </Link>
            {projects.map((item) => (
              <Link
                key={item.id}
                href={workHref({ ...scope, project: item.id, agent: agent || undefined })}
                className={item.id === project ? "text-sm font-medium" : "text-sm text-muted-foreground"}
              >
                {item.name}
              </Link>
            ))}
            <Link
              href={workHref({ ...scope, project: "none" })}
              className={project === "none" ? "text-sm font-medium" : "text-sm text-muted-foreground"}
            >
              No project
            </Link>
          </div>
        ) : null}
        {agentChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="Agent filter">
            <span className="text-sm text-muted-foreground">Agent:</span>
            <Link href={workHref(agentScope)} className={agent ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
              All agents
            </Link>
            {agentChips.map((row) => (
              <Link
                key={row.id}
                href={workHref({ ...agentScope, agent: row.id })}
                className={row.id === agent ? "text-sm font-medium" : "text-sm text-muted-foreground"}
              >
                {row.label}
                {row.role === "lead" ? " · lead" : ""}
              </Link>
            ))}
            <Link href={workHref({ ...agentScope, agent: "lead" })} className={agent === "lead" ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
              Unassigned (lead)
            </Link>
          </div>
        ) : null}
        <WorkBoard
          cards={visible}
          now={now}
          showClient={!client}
          showProject={project === "" || project === "none"}
          runCap={Number.isFinite(runCap) ? runCap : null}
          runsOpen={runsOpen}
          activity={activity}
          runningTaskIds={swarm.runningTaskIds}
          packs={swarm.packs}
          reviewOverride={reviewOverride}
          agents={agents}
        />
      </PageFrame>
    </StaffShell>
  );
}
