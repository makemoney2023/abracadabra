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
  "list_workflows",
  "list_projects",
  "list_swarm_packs",
  "list_space_files",
  "read_space_file",
  "read_deliverable",
  "list_repos",
  "list_repo_files",
  "read_repo_file",
  "search_repo",
  "pipeline_status",
  "list_social_accounts",
  "list_social_posts",
  "social_overview",
  "list_social_pieces",
  "get_social_cadence",
  "search_console",
] as const;

export const GATED_HQ_TOOLS = new Set([
  "publish_deliverable",
  "publish_client_status",
  "invite_person",
  "merge_clients",
  "set_task_stage",
  "review_task",
  "add_work",
  "revise_brief",
  "instruct_task",
  "pause_client",
  "resume_client",
  "decide_work_request",
  "link_slack_channel",
  "queue_followup_swarms",
  "publish_swarm_report",
  "delete_task",
  "delete_project",
  "schedule_social",
  "execute_social_plan",
  "approve_agent_social_plan",
  "set_agent_social_permission",
]);

/** Every tool the chat model may call besides the reads. A tool missing here is invisible to the model. */
export const CHAT_WRITE_TOOLS = [
  "create_client",
  "add_contact",
  "add_note",
  "log_call",
  "create_task",
  "file_actions",
  "complete_task",
  "move_deal",
  "set_deal_step",
  "draft_client_status",
  "create_project",
  "assign_space_project",
  "assign_repo_project",
  "create_workflow_group",
  "create_workflow",
  "assign_workflow",
  "start_pipeline",
  "append_pipeline_stage",
  "abandon_pipeline",
  "accept_workflow",
  "run_workflow",
  "answer_question",
  "save_swarm_report",
  "create_milestone",
  "post_internal_status",
  "prepare_social_publish",
  "prepare_social_move",
  "prepare_social_cancel",
  "prepare_social_retry",
  "prepare_social_cadence",
  "prepare_social_connect",
  "prepare_social_disconnect",
  "save_social_variant",
  ...GATED_HQ_TOOLS,
] as const;

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
  list_tasks: {
    label: "List tasks",
    description:
      "Tasks for a client with status, stage, column (todo, doing, review, done; review is Waiting on Client Services), review_note, and project_id. Fields: organizationId.",
  },
  list_projects: {
    label: "List projects",
    description: "Projects for a client. Use an id before creating a project or a swarm. Fields: organizationId.",
  },
  list_deliverables: { label: "List deliverables", description: "Deliverables for a client. Fields: organizationId." },
  open_questions: { label: "Open questions", description: "Agent questions waiting for staff. Fields: organizationId." },
  recent_activity: { label: "Recent activity", description: "The client timeline, newest first. Fields: organizationId." },
  get_brief: { label: "Read the brief", description: "The latest brief and its status. Fields: organizationId." },
  list_social_accounts: {
    label: "Social accounts",
    description: "The client's connected social accounts and blog sites, with ids for schedule_social. Fields: organizationId.",
  },
  list_social_posts: {
    label: "Social posts",
    description: "Posts sent or scheduled for a client: piece, type, status, time, and errors. Fields: organizationId.",
  },
  schedule_social: {
    label: "Schedule to social",
    description:
      "Send finished-work pieces to the client's social accounts. Empty itemIds means every piece of the deliverable; empty accountIds means every connected social account. mode is draft, scheduled, or now. Scheduled needs startAt (YYYY-MM-DDTHH:MM wall clock) and timezone (IANA), and spaces each next piece gapMinutes later (default 1440). postType is auto (match each piece), feed, carousel, reel, story, or short. Only pieces the client approved can be scheduled or posted now. Fields: organizationId, deliverableId, itemIds, accountIds, mode, postType, startAt, timezone, gapMinutes.",
  },
  social_overview: {
    label: "Social overview",
    description:
      "Eligible social accounts, ready and scheduled counts, open attention, and partial posts. A partial post is not a full success. WordPress, Wix, and Pinterest stay off this list. Fields: organizationId.",
  },
  list_social_pieces: {
    label: "Social pieces",
    description:
      "Finished pieces for one client, with approval and version. Pass deliverableId to limit the list. An empty list is not every piece. Fields: organizationId, deliverableId.",
  },
  search_console: {
    label: "Search Console data",
    description:
      "A client's synced Google Search Console data, read-only and staff-only: per property the status (ok, empty, pending, unavailable), last sync, data through, clicks, impressions, CTR and position with change vs the previous period, top queries and pages, and opportunities (low CTR on page 1, striking distance at position 4-20, query and page click drops, site drop). range is 7d, 28d (default), 90d, or 16m. Never quote the numbers to the client as-is. Fields: organizationId, propertyId, range.",
  },
  get_social_cadence: {
    label: "Publishing cadence",
    description:
      "The client's publishing cadence and the next open slots. Approval alone does not publish. Fields: organizationId.",
  },
  prepare_social_publish: {
    label: "Prepare a social publish",
    description:
      "Prepare an exact publish plan and do not post. An empty itemIds or accountIds list is not every piece. mode is draft, scheduled, or now. Scheduled needs startAt and timezone, and spaces each next piece gapMinutes later (default 60). Fields: organizationId, deliverableId, itemIds, accountIds, mode, postType, startAt, timezone, gapMinutes.",
  },
  prepare_social_move: {
    label: "Prepare a social move",
    description: "Prepare a plan to move one post. Does not change the post. Fields: organizationId, postId, scheduledFor, timezone.",
  },
  prepare_social_cancel: {
    label: "Prepare a social cancel",
    description: "Prepare a plan to cancel one post. Does not cancel it. Fields: organizationId, postId.",
  },
  prepare_social_retry: {
    label: "Prepare a social retry",
    description: "Prepare a plan to retry one open attention item. Does not post. Fields: organizationId, attentionId.",
  },
  prepare_social_cadence: {
    label: "Prepare a cadence change",
    description:
      "Prepare a plan to change the publishing cadence. Does not save it. Fields: organizationId, enabled, accountIds, weekdays, times, timezone.",
  },
  prepare_social_connect: {
    label: "Prepare a social connect",
    description:
      "Prepare a plan to connect one eligible network. Does not open the provider. Fields: organizationId, platform, redirectUrl.",
  },
  prepare_social_disconnect: {
    label: "Prepare a social disconnect",
    description: "Prepare a plan to disconnect one eligible account. Does not disconnect it. Fields: organizationId, accountId.",
  },
  save_social_variant: {
    label: "Save a network copy",
    description:
      "Save one network copy of a piece when agent social actions are on. Fields: organizationId, itemId, version, platform, caption, firstComment, title, tags, postType, mediaOrder, expectedRevision.",
  },
  execute_social_plan: {
    label: "Execute a social plan",
    description:
      "Run one prepared social plan after the approval card. Sends only the rows in that plan. Fields: organizationId, planId, planHash, externalId.",
  },
  approve_agent_social_plan: {
    label: "Approve an agent's social plan",
    description:
      "Approve one plan a function agent prepared (cancel or move; publish now needs no approval once the agent is granted it). The agent then runs it with the approval token. Nothing posts until the agent executes it. Fields: organizationId, planId, planHash, note.",
  },
  set_agent_social_permission: {
    label: "Set an agent's social permission",
    description:
      "Turn scheduling on or off for one function agent on one client. canSchedule lets it schedule, move and cancel (move and cancel still need approval); canPublishNow also lets it publish now, with no per-post approval when the card is Done and the piece approved. canApprove lets it approve or un-approve a single social piece (it never schedules; leave it out to keep the current value). Default is off. Fields: organizationId, agentId, canSchedule, canPublishNow, canApprove, platforms.",
  },
  list_work_requests: { label: "Client requests", description: "Requests from client email and Slack. Fields: organizationId." },
  create_client: {
    label: "Create a client",
    description: "Add a client, open a file space, and start the same schema check a lead gets. parentId puts it under a holding company (an existing client id). skipIntake true is for an existing client: space only, no schema check, no lead pickup. Fields: name, website, parentId, skipIntake.",
  },
  add_contact: { label: "Add a contact", description: "Add a person to a client. Fields: organizationId, name, email." },
  add_note: { label: "Add a note", description: "Internal note on the client timeline. Use this only for a fact that is not a task, a deal move, or a brief change. Fields: organizationId, body." },
  log_call: { label: "Log a call", description: "Record a call. Fields: organizationId, body." },
  create_task: { label: "Create a task", description: "Staff task for a client. It shows on the client board. Fields: organizationId, title." },
  file_actions: {
    label: "File tasks and a brief change",
    description:
      "One task per line of title, written as Title | person | YYYY-MM-DD | .cursor/skills/path. body is the brief sentence and is stored on the project. rules are standing limits, one per line. Pass projectId, or omit it when the client has one open project. Fields: organizationId, projectId, title, body, rules.",
  },
  complete_task: { label: "Complete a task", description: "Mark a task done. Fields: taskId." },
  delete_task: {
    label: "Delete a task",
    description: "Remove a task from the board. A workflow linked to it stops being due. Fields: taskId.",
  },
  delete_project: {
    label: "Delete a project",
    description:
      "Remove a project and its tasks. The client's space, repo, and deliverables stay, with the project link cleared. Fields: projectId.",
  },
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
  create_project: {
    label: "Create a project",
    description:
      "New project for a client. description is the brief in the staff member's words and is stored on the project. A name that already exists returns that project and fills an empty description. One loose space and one loose repo on that client are attached. Several stay listed as looseSpaces and looseRepos. The Library is part of the social pipeline: pass include_in_library false for print and other non-social projects so their finished work stays out of it (default true). Fields: organizationId, name, description, include_in_library.",
  },
  assign_space_project: {
    label: "Assign a space",
    description: "Put one of this client's spaces on one of this client's projects. Fields: organizationId, workspaceId, projectId.",
  },
  assign_repo_project: {
    label: "Assign a repo",
    description: "Put one of this client's repos on one of this client's projects. Fields: organizationId, repoId, projectId.",
  },
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
    description:
      "Move a task on the four-column board: todo (To do), doing (Doing, stores build), or review (Waiting on Client Services; starts nothing). The stage names describe, engineer, build, and run still work. Build needs an approved brief. Fields: taskId, stage, note (review only).",
  },
  review_task: {
    label: "Admin override: decide a review",
    description:
      "Admin override only (super admins). Client Services normally decides Review cards. Decide a task in the Review column (Waiting on Client Services). decision approve moves it to done. progress sends it back to its stage as in progress and starts nothing. build sends it back to build (a build move: legacy starts a cloud run). A send back needs a note. Fields: taskId, decision (approve, progress, build), note.",
  },
  add_work: {
    label: "Add work to the brief",
    description:
      "New brief piece stored on the project. Pass the projectId from create_project. Fields: organizationId, projectId, kind (page, website, social_pack, document), outcome, goal, due.",
  },
  revise_brief: { label: "Ask for a brief rewrite", description: "Send changes for the brief. Fields: organizationId, body." },
  instruct_task: { label: "Instruct the agent", description: "Instruction the agent reads on its next run. Fields: taskId, body." },
  answer_question: {
    label: "Answer the agent",
    description:
      "Answer an open agent question. A pipeline stage that asked it runs again with this answer. Fields: id, answer.",
  },
  pause_client: { label: "Pause the agent", description: "Stop agent work for a client. Fields: organizationId." },
  resume_client: { label: "Resume the agent", description: "Restart agent work for a client. Fields: organizationId." },
  link_slack_channel: {
    label: "Link a Slack channel",
    description: "Route a Slack Connect channel to a client. Fields: organizationId, channelId (starts with C or G).",
  },
  list_space_files: {
    label: "List space files",
    description:
      "Files in this client's space. Swarm output is under agent/swarm/. path is an optional prefix. Fields: organizationId, path, projectId.",
  },
  read_space_file: {
    label: "Read a space file",
    description:
      "Read one text file from the client's space, including swarm markdown. Pass id from list_space_files, or organizationId and path. Fields: id, organizationId, path.",
  },
  read_deliverable: {
    label: "Read a deliverable",
    description: "Read the text of one project document or brief. Fields: id, organizationId.",
  },
  list_repos: {
    label: "List repos",
    description: "GitHub repos attached to this client. Fields: organizationId.",
  },
  list_repo_files: {
    label: "List repo files",
    description:
      "List one folder in a repo attached to this client. path is optional and starts at the root. Pass repoId when the client has more than one repo. Fields: organizationId, repoId, projectId, path.",
  },
  read_repo_file: {
    label: "Read a repo file",
    description:
      "Read one text file from a repo attached to this client. path is the file path. Pass repoId when the client has more than one repo. Fields: organizationId, repoId, path.",
  },
  search_repo: {
    label: "Search a repo",
    description:
      "Search code in a repo attached to this client. query is the words to find. Pass repoId when the client has more than one repo. Fields: organizationId, repoId, query.",
  },
  list_workflows: {
    label: "List workflows",
    description: "Workflow groups for a client. Pass projectId to see that project's workflows. Fields: organizationId, projectId.",
  },
  list_swarm_packs: {
    label: "Swarm packs",
    description:
      "Skill templates the swarm can run, one skill each. With no query, returns research, copy, language, and visual skills. Pass query to find any other skill by name. Use an id, or a .cursor/skills path, with create_workflow. Fields: query.",
  },
  create_workflow_group: {
    label: "Create a workflow group",
    description: "A group of workflows for one client. Pass projectId to tie the group to that project. Fields: organizationId, name, projectId.",
  },
  create_workflow: {
    label: "Create a workflow",
    description:
      "Add a swarm template to a client's group and write its skill steps onto a task the work wake can run. Create the research workflow before copy, visuals, or a calendar. The group runs one at a time. templateId is a pack id such as pack-schema-readiness. Pass projectId to assign it now. dueAt is a unix millisecond time for the first swarm run. everyMs repeats it and must be at least 15 minutes. mcpServerIds names catalog servers each step may call, such as swarm-demo. Fields: organizationId, groupId, name, templateId, projectId, dueAt, everyMs, mcpServerIds. Off when AGENT_MODE is agents.",
  },
  assign_workflow: {
    label: "Assign a workflow",
    description: "Assign a workflow to a project of the same client. Fields: id, projectId.",
  },
  run_workflow: {
    label: "Run a workflow",
    description:
      "Run one pipeline stage after the previous page is accepted. A stage that is still waiting returns waiting_accept and does not start. body is the instruction, and copy, visuals, and language need Facts: and Do not use:. Fields: id, body. Off when AGENT_MODE is agents (run_workflow still hands a task-backed workflow to the lead agent).",
  },
  start_pipeline: {
    label: "Start a specialist pipeline",
    description:
      "Create one stage per skill path, in order, and start the first. paths is one .cursor/skills path per line. Pass every stage in this one call. auto true files each finished page in the space and starts the next stage. Without auto, the next stage waits for accept_workflow. name is the label. body is the instruction, and copy, visuals, and language need Facts: and Do not use:. Each stage gets a task on the project board. The result has status, output, and auto. Only running or completed means the first stage started. source means the brief lacks Facts: and Do not use:. Fields: organizationId, projectId, name, paths, body, auto. Off when AGENT_MODE is agents.",
  },
  append_pipeline_stage: {
    label: "Add a pipeline stage",
    description:
      "Add one skill at the end of an open pipeline. It does not start. Fields: organizationId, groupId, paths. Off when AGENT_MODE is agents.",
  },
  abandon_pipeline: {
    label: "Close a pipeline",
    description:
      "Mark unfinished stages stale and close the group so a new pipeline can start. Accepted pages stay. Board tasks for stages that never started are removed. Fields: organizationId, groupId.",
  },
  accept_workflow: {
    label: "Accept a specialist page",
    description:
      "Accept a completed stage. With auto, the server already accepted it and started the next stage. Without auto, call run_workflow for the next stage. A visual stage renders its image prompts. Fields: id. Off when AGENT_MODE is agents.",
  },
  pipeline_status: {
    label: "Pipeline status",
    description:
      "List each stage in order with its kind, status, receipt, and whether it is accepted. Fields: organizationId, groupId.",
  },
  publish_swarm_report: {
    label: "Publish the swarm PDF",
    description:
      "Show the finished swarm PDF to the client. id is the workflow. The file is agent/swarm/<run>/report.pdf. Fields: id.",
  },
  save_swarm_report: {
    label: "Save the swarm PDF",
    description:
      "Save the finished swarm's PDF report into the client space at agent/swarm/<run>/report.pdf. A finished run also saves it. Fields: id (workflow id).",
  },
  queue_followup_swarms: {
    label: "Queue the next swarms",
    description:
      "After a swarm finishes, file the next set without starting it. title is one line per swarm: Name | pack id. id is the finished workflow. name is the new group. Fields: organizationId, id, title, body, projectId, name. Off when AGENT_MODE is agents.",
  },
  decide_work_request: {
    label: "Decide a client request",
    description:
      "Approve or decline a client request. Fields: id, decision (approved or declined). Approve also needs kind and outcome; goal and due are optional. Decline needs body as the reason.",
  },
};
