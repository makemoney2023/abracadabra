import type { ProjectStatus, StatusAudience, StatusHealth, TaskStatus } from "@/db/crm";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  waiting_on_client: "Waiting on the client",
  done: "Done",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  blocked: "Blocked",
  done: "Done",
};

export const HEALTH_LABEL: Record<StatusHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  done: "Done",
};

export const AUDIENCE_LABEL: Record<StatusAudience, string> = {
  internal: "Internal",
  client: "Client",
};
