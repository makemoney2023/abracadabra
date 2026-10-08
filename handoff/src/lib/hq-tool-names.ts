export const READ_HQ_TOOLS = [
  "search_clients",
  "client_summary",
  "list_deals",
  "list_tasks",
  "list_deliverables",
  "open_questions",
  "recent_activity",
  "get_brief",
  "list_work_requests",
] as const;

export const GATED_HQ_TOOLS = new Set([
  "publish_deliverable",
  "publish_client_status",
  "invite_person",
  "merge_clients",
  "set_task_stage",
  "add_work",
  "revise_brief",
  "instruct_task",
  "answer_question",
  "pause_client",
  "resume_client",
  "decide_work_request",
  "link_slack_channel",
]);

export function hqToolNeedsApproval(name: string): boolean {
  return GATED_HQ_TOOLS.has(name);
}

/** What each tool does and the fields it reads. The model sees this; the approval card shows the label. */
export const HQ_TOOL_HELP: Record<string, { label: string; description: string }> = {
  search_clients: { label: "Search clients", description: "Find clients by name. Fields: query." },
  client_summary: { label: "Client summary", description: "One client record, including open deals. Fields: organizationId." },
  list_deals: {
    label: "List deals",
    description: "Deals for a client. Use the id with move_deal. Fields: organizationId.",
  },
  list_tasks: { label: "List tasks", description: "Tasks for a client with status and stage. Fields: organizationId." },
  list_deliverables: { label: "List deliverables", description: "Deliverables for a client. Fields: organizationId." },
  open_questions: { label: "Open questions", description: "Agent questions waiting for staff. Fields: organizationId." },
  recent_activity: { label: "Recent activity", description: "The client timeline, newest first. Fields: organizationId." },
  get_brief: { label: "Read the brief", description: "The latest brief and its status. Fields: organizationId." },
  list_work_requests: { label: "Client requests", description: "Requests from client email and Slack. Fields: organizationId." },
  create_client: { label: "Create a client", description: "Add a client record. Fields: name." },
  add_contact: { label: "Add a contact", description: "Add a person to a client. Fields: organizationId, name, email." },
  add_note: { label: "Add a note", description: "Internal note on the client timeline. Use this only for a fact that is not a task, a deal move, or a brief change. Fields: organizationId, body." },
  log_call: { label: "Log a call", description: "Record a call. Fields: organizationId, body." },
  create_task: { label: "Create a task", description: "Staff task for a client. It shows on the client board. Fields: organizationId, title." },
  file_actions: {
    label: "File tasks and a brief change",
    description:
      "One task per line of title, written as Title | person | YYYY-MM-DD | .cursor/skills/path. body is the brief sentence. rules are standing limits, one per line. Fields: organizationId, title, body, rules.",
  },
  complete_task: { label: "Complete a task", description: "Mark a task done. Fields: taskId." },
  set_deal_step: {
    label: "Set the next step",
    description: "The next step on a deal, and when it is due. Fields: dealId, body, due (YYYY-MM-DD or a weekday).",
  },
  draft_client_status: {
    label: "Draft a client status",
    description: "A status update the client does not see until staff publish it. Fields: projectId, body.",
  },
  move_deal: {
    label: "Move a deal",
    description:
      "Change a deal stage. Stage won turns a lead into a client and opens a project and a space. Fields: dealId, stage (new, contacted, call_booked, proposal, won, lost), lostReason when the stage is lost.",
  },
  create_project: { label: "Create a project", description: "New project for a client. Fields: organizationId, name." },
  create_milestone: { label: "Create a milestone", description: "Milestone on a project. Fields: projectId, name." },
  post_internal_status: {
    label: "Internal status",
    description: "Status update staff see. Fields: projectId, body, health (on_track, at_risk, off_track, done).",
  },
  publish_deliverable: { label: "Publish to the client", description: "Show a deliverable to the client. Fields: deliverableId." },
  publish_client_status: {
    label: "Client status update",
    description: "Status update the client sees. Fields: projectId, body, health (on_track, at_risk, off_track, done).",
  },
  invite_person: {
    label: "Invite a person",
    description: "Email an invite to a client space. Fields: workspaceId, email, role (client_member or client_owner).",
  },
  merge_clients: { label: "Merge clients", description: "Merge two client records. Fields: keepId, dropId." },
  set_task_stage: {
    label: "Move a task",
    description: "Set a task stage: describe, engineer, build, run. Build needs an approved brief. Fields: taskId, stage.",
  },
  add_work: {
    label: "Add work to the brief",
    description: "New brief piece. Fields: organizationId, kind (page, website, social_pack, document), outcome, goal, due.",
  },
  revise_brief: { label: "Ask for a brief rewrite", description: "Send changes for the brief. Fields: organizationId, body." },
  instruct_task: { label: "Instruct the agent", description: "Instruction the agent reads on its next run. Fields: taskId, body." },
  answer_question: { label: "Answer the agent", description: "Answer an open agent question. Fields: id, answer." },
  pause_client: { label: "Pause the agent", description: "Stop agent work for a client. Fields: organizationId." },
  resume_client: { label: "Resume the agent", description: "Restart agent work for a client. Fields: organizationId." },
  link_slack_channel: {
    label: "Link a Slack channel",
    description: "Route a Slack Connect channel to a client. Fields: organizationId, channelId (starts with C or G).",
  },
  decide_work_request: {
    label: "Decide a client request",
    description:
      "Approve or decline a client request. Fields: id, decision (approved or declined). Approve also needs kind and outcome; goal and due are optional. Decline needs body as the reason.",
  },
};
