import Link from "next/link";
import type { BoardActivity, BoardCard, ProjectRow } from "@/db/crm";
import { ActionField, ActionForm } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import type { SwarmRunRow } from "@/lib/swarm-runs";
import { WorkBoard } from "../../work/board";
import { swarmRunLink } from "../../swarm/swarm-link";
import { ProjectForm } from "../../projects/forms";
import { assignSwarmRunAction } from "../actions";
import { TaskForm } from "../activity-forms";
import { tabHref } from "./tabs";

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2 text-sm";

export function WorkTab({
  organizationId,
  projects,
  cards,
  activity,
  now,
  projectId,
  runCap,
  runsOpen,
  opens,
  unassignedRuns,
}: {
  organizationId: string;
  projects: ProjectRow[];
  cards: BoardCard[];
  activity: BoardActivity[];
  now: number;
  projectId: string;
  runCap: number | null;
  runsOpen: number;
  opens: { projectId: string | null; open: number }[];
  unassignedRuns: SwarmRunRow[];
}) {
  const base = tabHref(organizationId, "work");
  const open = (id: string | null) => opens.find((row) => row.projectId === id)?.open ?? 0;
  const at = now;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={base} className={projectId ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
          All projects
        </Link>
        {projects.map((project) => (
          <span key={project.id} className="inline-flex items-center gap-2">
            <Link
              href={`${base}&project=${project.id}`}
              className={projectId === project.id ? "text-sm font-medium" : "text-sm text-muted-foreground"}
            >
              {project.name} · {open(project.id)}
            </Link>
            <Link href={`/projects/${project.id}`} className="text-sm text-muted-foreground">
              Open
            </Link>
          </span>
        ))}
        <Link
          href={`${base}&project=none`}
          className={projectId === "none" ? "text-sm font-medium" : "text-sm text-muted-foreground"}
        >
          No project · {open(null)}
        </Link>
        <ProjectForm organizationId={organizationId} />
        <TaskForm
          organizationId={organizationId}
          projectId={projectId && projectId !== "none" ? projectId : undefined}
          label="Add a task"
          variant="outline"
        />
      </div>
      <WorkBoard
        cards={cards}
        now={at}
        showClient={false}
        showProject={projectId === ""}
        runCap={runCap}
        runsOpen={runsOpen}
        activity={activity}
      />
      <Card>
        <CardHeader>
          <CardTitle>Swarms not on a project</CardTitle>
        </CardHeader>
        <CardContent>
          {unassignedRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every swarm is on a project.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {unassignedRuns.map((run) => {
                const href = swarmRunLink(run.execution_id);
                return (
                  <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span>
                      {href ? <Link href={href}>{run.name}</Link> : run.name}
                      <span className="ml-2 text-muted-foreground">{run.status}</span>
                      <span className="ml-2 text-muted-foreground">{run.trigger}</span>
                      <span className="ml-2 text-muted-foreground">{formatRelative(run.started_at, at)}</span>
                    </span>
                    {projects.length === 0 ? (
                      <span className="text-muted-foreground">Add a project before this swarm can sit on one.</span>
                    ) : (
                      <ActionForm
                        action={assignSwarmRunAction}
                        submitLabel="Put on project"
                        pendingLabel="Saving"
                        className="w-auto flex-row flex-wrap items-end"
                      >
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="runId" value={run.id} />
                        <ActionField name="projectId" label="Project">
                          <select name="projectId" className={selectClass} defaultValue={projects[0]?.id ?? ""}>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </ActionField>
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
