import { adaptArtifact } from "./artifact-adapter";
import { nextSteps, type StepCard } from "./board-model";
import { chooseSkillsForPiece, type PieceKind, type SkillCard, type ToolCaller } from "./client-documents";
import { leadBrief } from "./lead-swarm";
import { pickSkillPack, type PackCandidate } from "./pack-picker";
import { DELIVERABLE_KINDS } from "./deliverable-manifest";

const KINDS = new Set<string>(DELIVERABLE_KINDS);
const PIECE_KINDS = new Set<PieceKind>(["website", "social_pack", "document", "other"]);

export type PlanSkill = { path: string; mode: "complete" | "plan"; status: "todo" | "doing" | "done" };

export type PlannedPiece = {
  kind: string;
  outcome: string;
  title: string;
  stage: "describe" | "engineer";
  skills: PlanSkill[];
};

type ContextTask = {
  id?: string;
  title?: string;
  status?: string;
  stage?: string;
  round?: number;
  projectId?: string | null;
  position?: number;
  createdAt?: number;
  deliverableId?: string | null;
  skills?: PlanSkill[];
  blockedReason?: string | null;
};

type ContextProject = { id?: string; name?: string; status?: string };

type ClientPicture = {
  organization?: {
    name?: string;
    website?: string | null;
    industry?: string | null;
    notes?: string | null;
    agentPausedAt?: number | null;
  };
  assessment?: { totalScore?: number | null } | null;
  project?: ContextProject | null;
  projects?: ContextProject[];
  tasks?: ContextTask[];
  answeredSince?: unknown[];
};

const ACTIVE_PROJECT = new Set(["planned", "active", "waiting_on_client"]);

/** Brief project, else the only active project. Two active projects need a person to choose. */
export function planningProject(input: {
  briefProjectId?: string | null;
  projects?: ContextProject[];
  fallbackProjectId?: string | null;
}): { projectId: string } | { ask: true } | { none: true } {
  if (input.briefProjectId) return { projectId: input.briefProjectId };
  const listed = input.projects ?? [];
  const active = listed.filter((project) => project.id && ACTIVE_PROJECT.has(project.status ?? "active"));
  if (active.length > 1) return { ask: true };
  if (active.length === 1 && active[0]?.id) return { projectId: active[0].id };
  if (listed.length > 0) return { ask: true };
  if (input.fallbackProjectId) return { projectId: input.fallbackProjectId };
  return { none: true };
}

/** Reads one brief section. A missing heading returns null so the caller can fall back. */
function section(markdown: string, heading: string): string | null {
  const match = new RegExp(`^## ${heading}\\s*$`, "m").exec(markdown);
  if (!match) return null;
  const from = match.index + match[0].length;
  const next = markdown.slice(from).search(/\n## /);
  return next < 0 ? markdown.slice(from) : markdown.slice(from, from + next);
}

function stageFor(skills: { path: string }[]): "describe" | "engineer" {
  return skills.some((skill) => /research|competitor|teardown/i.test(skill.path)) ? "describe" : "engineer";
}

function asPieceKind(kind: string): PieceKind {
  return PIECE_KINDS.has(kind as PieceKind) ? (kind as PieceKind) : "other";
}

function skillsFromBlock(block: string): PlanSkill[] {
  return block.split("\n").flatMap((line) => {
    const match = line.match(/^- `([^`]+)` \((complete|plan)\)$/);
    if (!match?.[1] || (match[2] !== "complete" && match[2] !== "plan")) return [];
    return [
      {
        path: match[1].replace(/^\.cursor\/skills\//, ""),
        mode: match[2],
        status: "todo" as const,
      },
    ];
  });
}

/** Pieces and skill paths from the brief. A missing Skills section uses the catalog. */
export function piecesFromBrief(markdown: string, catalog: SkillCard[] = []): PlannedPiece[] {
  const scope = section(markdown, "Scope") ?? "";
  const skillsSection = section(markdown, "Skills");
  const pieces: PlannedPiece[] = [];
  for (const line of scope.split("\n")) {
    const match = line.match(/^- ([a-z0-9_]+) (?:—|-) (.+)$/);
    if (!match?.[1] || !match[2]) continue;
    const kind = match[1];
    const outcome = match[2].trim();
    let skills: PlanSkill[] = [];
    if (skillsSection !== null) {
      const block = skillsSection.split(/\n(?=### )/).find((part) => part.trim().startsWith(`### ${kind}`));
      skills = block ? skillsFromBlock(block) : [];
    }
    if (skills.length === 0 && catalog.length > 0) {
      skills = chooseSkillsForPiece({ kind: asPieceKind(kind), outcome }, catalog).map((skill) => ({
        path: skill.path,
        mode: skill.mode,
        status: "todo" as const,
      }));
    }
    pieces.push({ kind, outcome, title: `${kind}: ${outcome}`, stage: stageFor(skills), skills });
  }
  return pieces;
}

function picture(value: unknown): ClientPicture {
  return value && typeof value === "object" ? (value as ClientPicture) : {};
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Picks up a new lead: a timeline note, a qualify task, and a space file when a space exists. */
export async function qualifyLead(input: {
  call: ToolCaller;
  requestId: string;
  packs?: PackCandidate[];
  trigger?: string;
  runSwarm?: (brief: string, templateId: string) => Promise<string | { output: string; status: string; executionId: string }>;
  onStillRunning?: (run: {
    executionId: string;
    templateId: string;
    activityKey: string;
    packName: string;
    trigger: string;
  }) => Promise<void>;
}): Promise<"started" | "skipped"> {
  const context = picture(await input.call("client_context", {}));
  if (context.organization?.agentPausedAt != null) return "skipped";
  const name = context.organization?.name ?? "this lead";
  const filed = fields(await input.call("store_scan_context", { requestId: `${input.requestId}:scan-context` }));
  const already = (context.tasks ?? []).some((task) => task.title === `Qualify ${name}` && task.status !== "done");
  if (already) return "skipped";
  const scanScore = typeof filed.score === "number" ? filed.score : null;
  const choice = pickSkillPack(
    { name, industry: context.organization?.industry, notes: context.organization?.notes },
    input.packs ?? [],
  );
  const brief = [
    leadBrief({
      name,
      website: context.organization?.website,
      score: scanScore ?? context.assessment?.totalScore,
      packId: choice.id,
    }),
    context.organization?.industry ? `Industry: ${context.organization.industry}` : "",
    context.organization?.notes ?? "",
    `Pack: ${choice.name}.`,
    typeof filed.context === "string" ? filed.context : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
  let swarm = "";
  let swarmStatus = "not_started";
  let executionId = "";
  if (input.runSwarm) {
    try {
      const finished = await input.runSwarm(brief, choice.id);
      if (typeof finished === "string") {
        swarm = finished;
        swarmStatus = finished.trim() ? "completed" : "failed";
      } else {
        swarm = finished.output;
        swarmStatus = finished.status;
        executionId = finished.executionId;
      }
    } catch (error) {
      swarm = error instanceof Error ? error.message : "The swarm did not finish.";
      swarmStatus = "failed";
    }
  }
  const body = swarm || `Picked up ${name}. Pack: ${choice.name}. Next is a fit note, a draft first email, and the next task.`;
  const adapted = adaptArtifact(body);
  const noteBody =
    adapted?.kind === "pdf" || adapted?.kind === "image" ? `Saved a ${adapted.extension} for ${name}.` : body;
  const fileBody = adapted && adapted.kind !== "markdown" ? body.trim() : `# ${name}\n\n${body}`;
  await input.call("add_note", {
    body: noteBody,
    requestId: `${input.requestId}:lead-note`,
  });
  await input.call("create_task", {
    title: `Qualify ${name}`,
    stage: "describe",
    skills: [],
    requestId: `${input.requestId}:qualify`,
  });
  let artifacts: string[] = [];
  if (swarmStatus !== "running") {
    const saved = fields(
      await input.call("save_space_file", {
        workflow: "lead",
        run: input.requestId,
        node: "qualify",
        body: fileBody,
        requestId: `${input.requestId}:lead-file`,
      }),
    );
    artifacts = Array.isArray(saved.stored) ? saved.stored.filter((path) => typeof path === "string") : [];
  }
  const activityKey = `${input.requestId}:swarm-run`;
  const trigger = input.trigger?.trim() || "lead_created";
  await input.call("record_swarm_run", {
    packId: choice.id,
    packName: choice.name,
    status: swarmStatus,
    executionId,
    body: swarmStatus === "not_started" ? `Swarm did not start. Pack: ${choice.name}.` : noteBody.slice(0, 500),
    artifacts,
    requestId: activityKey,
    activityKey,
    trigger,
  });
  if (swarmStatus === "running" && executionId && input.onStillRunning) {
    await input.onStillRunning({ executionId, templateId: choice.id, activityKey, packName: choice.name, trigger });
  }
  if (swarmStatus === "completed" && swarm.trim() && !swarm.includes("still going")) {
    try {
      await fileSwarmDelivery(input.call, {
        requestId: input.requestId,
        title: `${choice.name} for ${name}`.slice(0, 200),
        body: swarm,
      });
    } catch (error) {
      await input.call("add_note", {
        body: error instanceof Error ? error.message : "The draft was not filed.",
        requestId: `${input.requestId}:deliverable-miss`,
      });
    }
  }
  return "started";
}

/** An unpublished document staff can open on Finished work. The client sees it after staff publish. */
export async function fileSwarmDelivery(
  call: ToolCaller,
  input: { requestId: string; title: string; body: string; projectId?: string | null },
): Promise<void> {
  const created = fields(
    await call("create_deliverable", {
      title: input.title.slice(0, 200),
      kind: "document",
      projectId: input.projectId ?? "",
      requestId: `${input.requestId}:deliverable`,
    }),
  );
  const deliverableId = typeof created.deliverableId === "string" ? created.deliverableId : "";
  if (!deliverableId) return;
  await call("add_deliverable_item", {
    deliverableId,
    path: "result.md",
    bodyMarkdown: input.body,
    requestId: `${input.requestId}:deliverable-item`,
  });
}

/** One task and one draft deliverable per piece that does not already have a task. */
export async function planClientWork(input: {
  call: ToolCaller;
  requestId: string;
  now: number;
  catalog?: SkillCard[];
}): Promise<"planned" | "skipped"> {
  const context = picture(await input.call("client_context", {}));
  if (context.organization?.agentPausedAt != null) return "skipped";
  const brief = fields(await input.call("get_brief", { kind: "brief" }));
  const body = typeof brief.body === "string" ? brief.body : "";
  if (!body.trim()) return "skipped";
  const chosen = planningProject({
    briefProjectId: typeof brief.projectId === "string" ? brief.projectId : null,
    projects: context.projects,
    fallbackProjectId: context.projects ? null : (context.project?.id ?? null),
  });
  if ("ask" in chosen) {
    await input.call("ask_staff", {
      question: "Which project should these tasks use?",
      requestId: `${input.requestId}:project`,
    });
    return "skipped";
  }
  if ("none" in chosen) return "skipped";
  const pieces = piecesFromBrief(body, input.catalog ?? []);
  const existing = new Set((context.tasks ?? []).map((task) => task.title));
  const created: string[] = [];
  for (const piece of pieces) {
    if (existing.has(piece.title)) continue;
    const kind = KINDS.has(piece.kind) ? piece.kind : "other";
    const draft = fields(
      await input.call("create_deliverable", {
        title: piece.title,
        kind,
        projectId: chosen.projectId,
        requestId: `${input.requestId}:deliverable:${piece.kind}`,
      }),
    );
    await input.call("create_task", {
      title: piece.title,
      stage: piece.stage,
      projectId: chosen.projectId,
      deliverableId: typeof draft.deliverableId === "string" ? draft.deliverableId : undefined,
      skills: piece.skills,
      requestId: `${input.requestId}:task:${piece.kind}`,
    });
    created.push(piece.title);
  }
  if (created.length === 0) return "skipped";
  const client = context.organization?.name ?? "the client";
  const summary = `Planned ${created.length} tasks for ${client}: ${created.join("; ")}`;
  if (chosen.projectId) {
    await input.call("post_status_update", {
      projectId: chosen.projectId,
      audience: "internal",
      health: "on_track",
      body: summary,
      requestId: `${input.requestId}:status`,
    });
  }
  await input.call("add_note", {
    body: summary,
    kind: "plan",
    requestId: `${input.requestId}:plan`,
  });
  return "planned";
}

function skillName(skillPath: string, body: string): string {
  const named = body.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (named) return named;
  const parts = skillPath.split("/");
  return parts.at(-2) || parts.at(-1) || skillPath;
}

function deliverableKind(title: string): string {
  const kind = title.split(":")[0]?.trim() ?? "other";
  return KINDS.has(kind) ? kind : "other";
}

function buildBrief(input: {
  deliverableId: string;
  title: string;
  round: number;
  brief: string;
  design: string;
}): string {
  const kind = deliverableKind(input.title);
  const slug = kind.replaceAll("_", "-");
  return [
    `# Build brief`,
    ``,
    `Deliverable: ${input.deliverableId}`,
    `Kind: ${kind}`,
    `Title: ${input.title}`,
    ``,
    `## Brief`,
    input.brief.trim() || input.title,
    ``,
    `Keep every line under ## Rules. Do not drop those rules.`,
    ``,
    `## Design system`,
    input.design.trim(),
    ``,
    `## Items already in the deliverable`,
    `None yet.`,
    ``,
    `## Output`,
    `Branch handoff/${input.deliverableId}/r${input.round}.`,
    `Write deliverables/${slug}/manifest.json.`,
    `The pull request contains only the listed media and copy.`,
    `PR title: Deliverable ${input.deliverableId} round ${input.round}`,
    `PR body first line: Deliverable: ${input.deliverableId}`,
    ``,
    `## What not to do`,
    `No secrets.`,
    `No changes outside deliverables/${slug}/ and the app paths the brief names.`,
    `No force push.`,
  ].join("\n");
}

function currentSkill(skills: PlanSkill[]): PlanSkill | undefined {
  return skills.find((skill) => skill.status !== "done");
}

function eligible(task: ContextTask, answered: number): boolean {
  if (task.status === "done" || task.stage === "build" || task.stage === "run") return false;
  if (task.status === "blocked" && answered === 0) return false;
  return Boolean(task.id && currentSkill(task.skills ?? []));
}

function statusForProject(
  context: ClientPicture,
  statusById: Map<string, string>,
  projectId: string,
): string | null {
  const known = statusById.get(projectId);
  if (known) return known;
  if (context.projects === undefined) return context.project?.status ?? "active";
  if (projectId === context.project?.id) return context.project?.status ?? "active";
  return null;
}

function queueTasks(context: ClientPicture): { tasks: ContextTask[]; more: boolean } {
  const projects = context.projects ?? [];
  const statusById = new Map(
    projects.flatMap((project) => (project.id ? [[project.id, project.status ?? "active"] as const] : [])),
  );
  const nameById = new Map(projects.flatMap((project) => (project.id ? [[project.id, project.name ?? project.id] as const] : [])));
  const fallbackId = projects.length === 0 ? context.project?.id : undefined;
  const answeredCount = context.answeredSince?.length ?? 0;
  const cards = (context.tasks ?? []).flatMap((task) => {
    if (!task.id) return [];
    const projectId = task.projectId === undefined ? (fallbackId ?? null) : task.projectId;
    const projectStatus = projectId ? statusForProject(context, statusById, projectId) : null;
    const card: StepCard & { task: ContextTask } = {
      id: task.id,
      projectId,
      projectStatus,
      projectName: projectId ? (nameById.get(projectId) ?? context.project?.name) : undefined,
      status: task.status ?? "todo",
      stage: task.stage ?? "describe",
      position: task.position ?? 0,
      createdAt: task.createdAt ?? 0,
      blockedAnswered: answeredCount > 0,
      hasSkill: eligible(task, answeredCount),
      task,
    };
    return [card];
  });
  const ordered = nextSteps(cards, Number.POSITIVE_INFINITY);
  return { tasks: ordered.slice(0, 8).map((card) => card.task), more: ordered.length > 8 };
}

/** Runs one step of each open task, at most eight, then asks for another wake. */
export async function advanceClientWork(input: {
  call: ToolCaller;
  requestId: string;
  now: number;
  readSkill: (skillPath: string) => Promise<string | null>;
  onLoaded?: (skillPath: string, taskId: string) => void | string | null | Promise<void | string | null>;
}): Promise<{ advanced: number; reschedule: boolean }> {
  const context = picture(await input.call("client_context", {}));
  if (context.organization?.agentPausedAt != null) return { advanced: 0, reschedule: false };
  const queue = queueTasks(context);
  const tasks = queue.tasks;
  let advanced = 0;
  let reschedule = queue.more;
  for (const task of tasks) {
    if (advanced >= 8) {
      reschedule = true;
      break;
    }
    const skills = (task.skills ?? []).map((skill) => ({ ...skill }));
    const step = currentSkill(skills);
    if (!step || !task.id) continue;
    if (step.mode === "plan") {
      const brief = fields(await input.call("get_brief", { kind: "brief" }));
      const design = fields(await input.call("get_brief", { kind: "design_system" }));
      const deliverableId = task.deliverableId ?? "";
      const markdown = buildBrief({
        deliverableId,
        title: task.title ?? "Deliverable",
        round: task.round ?? 1,
        brief: typeof brief.body === "string" ? brief.body : "",
        design: typeof design.body === "string" ? design.body : "",
      });
      if (deliverableId) {
        await input.call("add_deliverable_item", {
          deliverableId,
          path: "build-brief.md",
          bodyMarkdown: markdown,
          requestId: `${input.requestId}:brief:${task.id}`,
        });
      } else {
        await input.call("add_note", {
          taskId: task.id,
          body: markdown,
          requestId: `${input.requestId}:brief:${task.id}`,
        });
      }
      step.status = "done";
      await input.call("update_task", {
        taskId: task.id,
        stage: "build",
        skills,
        note: "Wrote the build brief.",
        requestId: `${input.requestId}:build:${task.id}`,
      });
      advanced += 1;
      continue;
    }
    const loaded = await input.readSkill(step.path);
    if (!loaded) {
      await input.call("ask_staff", {
        taskId: task.id,
        question: `The skill file is missing: ${step.path}`,
        requestId: `${input.requestId}:missing:${task.id}`,
      });
      continue;
    }
    const produced = await input.onLoaded?.(step.path, task.id);
    const text = typeof produced === "string" ? produced.trim() : "";
    const artifact = text ? adaptArtifact(text) : null;
    const fileBody = artifact && artifact.kind !== "markdown" ? text : "";
    const name = skillName(step.path, loaded);
    const sentence = `Loaded ${name} for ${task.title ?? "this piece"}.`;
    if (fileBody && artifact) {
      await input.call("save_space_file", {
        workflow: "work",
        run: task.id,
        node: name,
        body: fileBody,
        requestId: `${input.requestId}:file:${task.id}:${step.path}`,
      });
    }
    if (task.deliverableId) {
      await input.call("add_deliverable_item", {
        deliverableId: task.deliverableId,
        path: fileBody && artifact ? `${name}.${artifact.extension}` : `${name}.md`,
        bodyMarkdown: sentence,
        requestId: `${input.requestId}:item:${task.id}:${step.path}`,
      });
    } else {
      await input.call("add_note", {
        taskId: task.id,
        body: sentence,
        requestId: `${input.requestId}:item:${task.id}:${step.path}`,
      });
    }
    step.status = "done";
    const unfinished = skills.some((skill) => skill.status !== "done");
    await input.call("update_task", {
      taskId: task.id,
      status: unfinished ? "doing" : "done",
      stage: unfinished ? task.stage : "run",
      skills,
      note: `Finished ${step.path}.`,
      requestId: `${input.requestId}:step:${task.id}:${step.path}`,
    });
    if (unfinished) reschedule = true;
    advanced += 1;
  }
  return { advanced, reschedule };
}

export type BriefTask = {
  id: string;
  title: string;
  status: string;
  stage: string;
  skills: PlanSkill[];
};

export type BriefAction =
  | { type: "create"; piece: PlannedPiece }
  | { type: "reset"; taskId: string; skills: PlanSkill[]; note: string }
  | { type: "ask"; taskId: string; question: string }
  | { type: "block"; taskId: string };

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function skillKey(skills: PlanSkill[]): string {
  return skills.map((skill) => `${skill.path}:${skill.mode}`).join("|");
}

/** Diff two brief versions into creates, skill resets, staff questions, and removals. */
export function briefChangeActions(
  previous: string,
  next: string,
  tasks: BriefTask[],
  catalog: SkillCard[] = [],
): BriefAction[] {
  const before = new Map(piecesFromBrief(previous, catalog).map((piece) => [normalizeTitle(piece.title), piece]));
  const after = piecesFromBrief(next, catalog);
  const afterByTitle = new Map(after.map((piece) => [normalizeTitle(piece.title), piece]));
  const briefTasks = tasks.filter((task) => /^[a-z0-9_]+: .+/.test(normalizeTitle(task.title)));
  const taskByTitle = new Map(briefTasks.map((task) => [normalizeTitle(task.title), task]));
  const actions: BriefAction[] = [];
  for (const piece of after) {
    const key = normalizeTitle(piece.title);
    const task = taskByTitle.get(key);
    if (!task) {
      actions.push({ type: "create", piece });
      continue;
    }
    const baseline = before.get(key)?.skills ?? task.skills;
    if (skillKey(baseline) === skillKey(piece.skills)) continue;
    const locked = task.status === "done" || task.stage === "build" || task.stage === "run";
    if (locked) {
      actions.push({
        type: "ask",
        taskId: task.id,
        question: "This piece is already in build. Start the next round, or keep it as it is?",
      });
    } else {
      actions.push({
        type: "reset",
        taskId: task.id,
        skills: piece.skills,
        note: "The brief changed this piece. Skills were reset.",
      });
    }
  }
  for (const task of briefTasks) {
    if (afterByTitle.has(normalizeTitle(task.title)) || task.status === "done" || task.status === "blocked") continue;
    actions.push({ type: "block", taskId: task.id });
  }
  return actions;
}

function briefTasksOf(tasks: ContextTask[] | undefined): BriefTask[] {
  return (tasks ?? []).flatMap((task) => {
    if (typeof task.id !== "string" || typeof task.title !== "string") return [];
    const skills = Array.isArray(task.skills)
      ? task.skills.flatMap((skill) => {
          if (typeof skill?.path !== "string" || (skill.mode !== "plan" && skill.mode !== "complete")) return [];
          const status: PlanSkill["status"] = skill.status === "doing" || skill.status === "done" ? skill.status : "todo";
          return [{ path: skill.path, mode: skill.mode, status }];
        })
      : [];
    return [{ id: task.id, title: task.title, status: task.status ?? "todo", stage: task.stage ?? "describe", skills }];
  });
}

/** Re-plans after an approved brief change. A new piece gets a draft and a task, as in the first plan. */
export async function applyBriefChange(input: {
  call: ToolCaller;
  requestId: string;
  now: number;
  catalog?: SkillCard[];
}): Promise<{ created: number; reset: number; asked: number; blocked: number }> {
  const counts = { created: 0, reset: 0, asked: 0, blocked: 0 };
  const context = picture(await input.call("client_context", {}));
  if (context.organization?.agentPausedAt != null) return counts;
  const brief = fields(await input.call("get_brief", { kind: "brief" }));
  const next = typeof brief.body === "string" ? brief.body : "";
  if (!next.trim()) return counts;
  const previous = typeof brief.previousBody === "string" ? brief.previousBody : "";
  const actions = briefChangeActions(previous, next, briefTasksOf(context.tasks), input.catalog);
  const chosen = planningProject({
    briefProjectId: typeof brief.projectId === "string" ? brief.projectId : null,
    projects: context.projects,
    fallbackProjectId: context.projects ? null : (context.project?.id ?? null),
  });
  if ("ask" in chosen) {
    await input.call("ask_staff", {
      question: "Which project should these tasks use?",
      requestId: `${input.requestId}:project`,
    });
    return counts;
  }
  const projectId = "projectId" in chosen ? chosen.projectId : undefined;
  let index = 0;
  for (const action of actions) {
    index += 1;
    if (action.type === "create") {
      const kind = KINDS.has(action.piece.kind) ? action.piece.kind : "other";
      const draft = fields(
        await input.call("create_deliverable", {
          title: action.piece.title,
          kind,
          projectId,
          requestId: `${input.requestId}:deliverable:${index}`,
        }),
      );
      await input.call("create_task", {
        requestId: `${input.requestId}:create:${index}`,
        title: action.piece.title,
        stage: action.piece.stage,
        projectId,
        deliverableId: typeof draft.deliverableId === "string" ? draft.deliverableId : undefined,
        skills: action.piece.skills,
      });
      counts.created += 1;
    } else if (action.type === "reset") {
      await input.call("update_task", {
        requestId: `${input.requestId}:reset:${action.taskId}`,
        taskId: action.taskId,
        skills: action.skills,
      });
      await input.call("add_note", {
        requestId: `${input.requestId}:note:${action.taskId}`,
        taskId: action.taskId,
        body: action.note,
      });
      counts.reset += 1;
    } else if (action.type === "ask") {
      await input.call("ask_staff", {
        requestId: `${input.requestId}:ask:${action.taskId}`,
        taskId: action.taskId,
        question: action.question,
        options: ["Start next round", "Keep as is"],
      });
      counts.asked += 1;
    } else {
      await input.call("update_task", {
        requestId: `${input.requestId}:block:${action.taskId}`,
        taskId: action.taskId,
        status: "blocked",
        blockedReason: "removed_from_brief",
      });
      counts.blocked += 1;
    }
  }
  return counts;
}

/** Keep every existing scope line and record the new piece as an addendum. */
export function appendBriefWork(
  markdown: string,
  piece: { kind: string; outcome: string; goal: string; due: string },
): string {
  const line = `- ${piece.kind} — ${piece.outcome}`;
  let next = markdown.trim();
  if (!next.includes("## Scope")) {
    next = next ? `${next}\n\n## Scope\n${line}\n` : `## Scope\n${line}\n`;
  } else {
    const match = next.match(/## Scope\n([\s\S]*?)(?=\n## |$)/);
    if (match && match.index !== undefined) {
      const block = match[0].replace(/\s*$/, "");
      next = `${next.slice(0, match.index)}${block}\n${line}\n${next.slice(match.index + match[0].length)}`;
    }
  }
  const section = `### ${piece.kind}: ${piece.outcome}\n${piece.goal}\nDue: ${piece.due}\n`;
  if (next.includes("## Addendum")) return `${next.trimEnd()}\n${section}`;
  return `${next.trimEnd()}\n\n## Addendum\n${section}`;
}
