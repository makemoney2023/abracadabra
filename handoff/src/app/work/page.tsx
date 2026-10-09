import Link from "next/link";
import { listBoard, listBoardActivity, boardClientChips, listProjects } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { PageFrame } from "@/components/page-frame";
import { StaffShell } from "../staff-shell";
import { WorkBoard } from "./board";
import { WorkToolbar } from "./filters";
import { filterWork, workCounts, workHref } from "./query";

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ late?: string; week?: string; blocked?: string; client?: string; project?: string }>;
}) {
  const query = await searchParams;
  const late = query.late === "1";
  const week = query.week === "1";
  const blocked = query.blocked === "1";
  const client = query.client ?? "";
  const project = query.project ?? "";
  const { sql, caller } = await requireHqStaffPage();
  const now = clock();
  const [cards, chips, projects, capRow] = await Promise.all([
    listBoard(sql, caller, {
      organizationId: client || undefined,
      projectId: project && project !== "none" ? project : undefined,
      unassigned: project === "none",
      hideInactiveProjects: project === "" || project === "none",
    }),
    boardClientChips(sql, caller),
    client ? listProjects(sql, caller, client) : Promise.resolve([]),
    sql.get<{ value: string }>("SELECT value FROM agent_settings WHERE key = 'max_cloud_runs'"),
  ]);
  const open = cards.filter((card) => card.status !== "done");
  const counts = workCounts(open, now);
  const visible = filterWork(cards, { late, week, blocked }, now);
  const orgIds = [...new Set(visible.map((card) => card.organization_id))];
  const activity = await listBoardActivity(sql, caller, orgIds);
  const runCap = capRow ? Number(capRow.value) : null;
  const scope = { late, week, blocked, client: client || undefined };

  return (
    <StaffShell>
      <PageFrame title="Work" description="Every open card. The agent takes the top card in Describe or Engineer.">
        <WorkToolbar late={late} week={week} blocked={blocked} client={client || undefined} project={project || undefined} counts={counts} />
        <div className="flex flex-wrap gap-2">
          <Link href={workHref({ late, week, blocked })} className={client ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
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
                href={workHref({ ...scope, project: item.id })}
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
        <WorkBoard
          cards={visible}
          now={now}
          showClient={!client}
          showProject={project === "" || project === "none"}
          runCap={Number.isFinite(runCap) ? runCap : null}
          activity={activity}
        />
      </PageFrame>
    </StaffShell>
  );
}
