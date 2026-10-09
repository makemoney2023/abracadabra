import Link from "next/link";
import type { ProjectRow, TaskRow } from "@/db/crm";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectForm } from "../../projects/forms";
import { PROJECT_STATUS_LABEL } from "../../projects/labels";
import { completeTaskAction } from "../actions";
import { TaskForm } from "../activity-forms";

export function WorkTab({
  organizationId,
  projects,
  tasks,
}: {
  organizationId: string;
  projects: ProjectRow[];
  tasks: TaskRow[];
}) {
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
    </div>
  );
}
