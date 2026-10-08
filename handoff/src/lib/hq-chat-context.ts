export type ChatPageContext = {
  organizationId?: string;
  projectId?: string;
  taskId?: string;
};

/** One line of page context. It is not permission: tools still check the staff member. */
export function chatContextLine(input: ChatPageContext): string {
  const parts = [
    input.organizationId ? `organization ${input.organizationId}` : "",
    input.projectId ? `project ${input.projectId}` : "",
    input.taskId ? `task ${input.taskId}` : "",
  ].filter(Boolean);
  if (parts.length === 0) return "";
  return `The staff member is looking at ${parts.join(", ")}. Use these ids when they say "here".`;
}
