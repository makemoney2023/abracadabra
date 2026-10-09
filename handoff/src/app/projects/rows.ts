import type { ProjectStatus, StatusHealth, TaskStatus } from "@/db/crm";

export type ProjectSource = {
  id: string;
  organizationId: string;
  client: string;
  name: string;
  status: ProjectStatus;
  health: StatusHealth | null;
  dueAt: number | null;
};

export type ProjectTaskCount = {
  projectId: string | null;
  status: TaskStatus;
};

export type ProjectIndexRow = {
  id: string;
  clientId: string;
  client: string;
  project: string;
  status: ProjectStatus;
  health: StatusHealth | null;
  dueAt: number | null;
  openTasks: number;
};

/** One index row per project. Done tasks and tasks with no project do not count as open. */
export function projectRows(projects: ProjectSource[], tasks: ProjectTaskCount[]): ProjectIndexRow[] {
  const open = new Map<string, number>();
  for (const task of tasks) {
    if (!task.projectId || task.status === "done") continue;
    open.set(task.projectId, (open.get(task.projectId) ?? 0) + 1);
  }
  return projects.map((project) => ({
    id: project.id,
    clientId: project.organizationId,
    client: project.client,
    project: project.name,
    status: project.status,
    health: project.health,
    dueAt: project.dueAt,
    openTasks: open.get(project.id) ?? 0,
  }));
}
