import { chooseSkillsForPiece, type PieceKind, type SkillCard, type ToolCaller } from "./client-documents";
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
  deliverableId?: string | null;
  skills?: PlanSkill[];
  blockedReason?: string | null;
};

type ClientPicture = {
  organization?: { name?: string; agentPausedAt?: number | null };
  project?: { id?: string } | null;
  tasks?: ContextTask[];
  answeredSince?: unknown[];
};

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
        projectId: context.project?.id,
        requestId: `${input.requestId}:deliverable:${piece.kind}`,
      }),
    );
    await input.call("create_task", {
      title: piece.title,
      stage: piece.stage,
      projectId: context.project?.id,
      deliverableId: typeof draft.deliverableId === "string" ? draft.deliverableId : undefined,
      skills: piece.skills,
      requestId: `${input.requestId}:task:${piece.kind}`,
    });
    created.push(piece.title);
  }
  if (created.length === 0) return "skipped";
  const client = context.organization?.name ?? "the client";
  const summary = `Planned ${created.length} tasks for ${client}: ${created.join("; ")}`;
  if (context.project?.id) {
    await input.call("post_status_update", {
      projectId: context.project.id,
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

/** Runs one step of each open task, at most eight, then asks for another wake. */
export async function advanceClientWork(input: {
  call: ToolCaller;
  requestId: string;
  now: number;
  readSkill: (skillPath: string) => Promise<string | null>;
  onLoaded?: (skillPath: string, taskId: string) => void | Promise<void>;
}): Promise<{ advanced: number; reschedule: boolean }> {
  const context = picture(await input.call("client_context", {}));
  if (context.organization?.agentPausedAt != null) return { advanced: 0, reschedule: false };
  const tasks = (context.tasks ?? []).filter((task) => eligible(task, context.answeredSince?.length ?? 0));
  let advanced = 0;
  let reschedule = false;
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
    await input.onLoaded?.(step.path, task.id);
    const name = skillName(step.path, loaded);
    const sentence = `Loaded ${name} for ${task.title ?? "this piece"}.`;
    if (task.deliverableId) {
      await input.call("add_deliverable_item", {
        deliverableId: task.deliverableId,
        path: `${name}.md`,
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
  const projectId = context.project?.id;
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
