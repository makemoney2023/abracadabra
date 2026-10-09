import Link from "next/link";
import type { ProjectRow, TaskRow } from "@/db/crm";
import { ActionField, ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clock } from "@/lib/clock";
import { formatRelative } from "@/lib/format";
import type { SwarmRunRow } from "@/lib/swarm-runs";
import { swarmRunLink } from "../../swarm/swarm-link";
import { ProjectForm } from "../../projects/forms";
import { PROJECT_STATUS_LABEL } from "../../projects/labels";
import { assignSwarmRunAction, completeTaskAction } from "../actions";
import { TaskForm } from "../activity-forms";

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2 text-sm";

export function WorkTab({
  organizationId,
  projects,
  tasks,
  unassignedRuns,
}: {
  organizationId: string;
  projects: ProjectRow[];
  tasks: TaskRow[];
  unassignedRuns: SwarmRunRow[];
}) {
  const now = clock();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Milestones, tasks, and status updates live on the project.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <li key={project.id} className="text-sm">
                  <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  <span className="ml-2 text-muted-foreground">{PROJECT_STATUS_LABEL[project.status]}</span>
                </li>
              ))}
            </ul>
          )}
          <ProjectForm organizationId={organizationId} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Tasks</CardTitle>
          <TaskForm organizationId={organizationId} label="Add a task" variant="outline" />
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open tasks.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{task.title}</span>
                  <ActionForm
                    action={completeTaskAction}
                    submitLabel="Mark done"
                    pendingLabel="Saving"
                    className="w-auto flex-row items-center"
                  >
                    <input type="hidden" name="organizationId" value={organizationId} />
                    <input type="hidden" name="taskId" value={task.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
                      <span className="ml-2 text-muted-foreground">{formatRelative(run.started_at, now)}</span>
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
