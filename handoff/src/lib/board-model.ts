export const BOARD_COLUMNS = ["describe", "engineer", "build", "run", "review", "done"] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABEL: Record<BoardColumn, string> = {
  describe: "Describe",
  engineer: "Engineer",
  build: "Build",
  run: "Run",
  review: "Review",
  done: "Done",
};

/** Columns that are a stage on the row. Review and done are flags over the stage. */
export const STAGE_COLUMNS = ["describe", "engineer", "build", "run"] as const;

/** Review sits on a task while review_requested_at is set and it is not done. */
export function inReview(task: { status: string; review_requested_at?: number | null }): boolean {
  return task.status !== "done" && task.review_requested_at != null;
}

/**
 * SQL for "this row sits in column ?". Bind the column three times.
 * Done is status; Review is the review flag; the stage columns leave Review cards out.
 */
export const COLUMN_SQL = `(
         (? = 'done' AND status = 'done')
         OR (? = 'review' AND status != 'done' AND review_requested_at IS NOT NULL)
         OR (stage = ? AND status != 'done' AND review_requested_at IS NULL)
       )`;

const DONE_LIMIT = 30;
const ACTIVE_PROJECT = new Set(["planned", "active", "waiting_on_client"]);

export type PlacedTask = {
  id: string;
  status: string;
  stage: string;
  position: number;
  created_at: number;
  done_at: number | null;
  review_requested_at?: number | null;
};

export type StepCard = {
  id: string;
  projectId: string | null;
  projectStatus: string | null;
  projectName?: string;
  status: string;
  stage: string;
  position: number;
  createdAt: number;
  blockedAnswered: boolean;
  hasSkill: boolean;
  /** In Review: waiting on staff, so the HQ agent does not pick it up. */
  inReview?: boolean;
};

type SkillStep = { path?: unknown; status?: unknown };

/** The column a card sits in. Done is status. Review is a flag over the stage. Blocked stays where it is. */
export function columnOf(task: { status: string; stage: string; review_requested_at?: number | null }): BoardColumn {
  if (task.status === "done") return "done";
  if (inReview(task)) return "review";
  if (task.stage === "engineer" || task.stage === "build" || task.stage === "run" || task.stage === "describe") {
    return task.stage;
  }
  return "describe";
}

function byQueue(left: PlacedTask, right: PlacedTask): number {
  if (left.position !== right.position) return left.position - right.position;
  if (left.created_at !== right.created_at) return left.created_at - right.created_at;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function byDone(left: PlacedTask, right: PlacedTask): number {
  const leftAt = left.done_at ?? 0;
  const rightAt = right.done_at ?? 0;
  if (leftAt !== rightAt) return rightAt - leftAt;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/** Places each task in one column. Done keeps the 30 most recently finished cards. */
export function boardCards<T extends PlacedTask>(tasks: T[]): Record<BoardColumn, T[]> {
  const columns: Record<BoardColumn, T[]> = {
    describe: [],
    engineer: [],
    build: [],
    run: [],
    review: [],
    done: [],
  };
  for (const task of tasks) columns[columnOf(task)].push(task);
  for (const column of BOARD_COLUMNS) {
    if (column === "done") columns.done.sort(byDone);
    else columns[column].sort(byQueue);
  }
  columns.done = columns.done.slice(0, DONE_LIMIT);
  return columns;
}

function ready(card: StepCard): boolean {
  if (!card.id || !card.hasSkill || card.inReview) return false;
  if (card.status === "done" || card.stage === "build" || card.stage === "run") return false;
  if (card.status === "blocked" && !card.blockedAnswered) return false;
  if (!card.projectId) return false;
  if (!card.projectStatus || !ACTIVE_PROJECT.has(card.projectStatus)) return false;
  return true;
}

function byStep(left: StepCard, right: StepCard): number {
  if (left.position !== right.position) return left.position - right.position;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/** Top card per project, then the next, until the budget is spent. */
export function nextSteps<T extends StepCard>(cards: T[], budget: number): T[] {
  const groups = new Map<string, T[]>();
  for (const card of cards) {
    if (!ready(card) || !card.projectId) continue;
    const group = groups.get(card.projectId);
    if (group) group.push(card);
    else groups.set(card.projectId, [card]);
  }
  for (const group of groups.values()) group.sort(byStep);
  const projectIds = [...groups.keys()].sort((left, right) => {
    const leftName = groups.get(left)?.[0]?.projectName ?? left;
    const rightName = groups.get(right)?.[0]?.projectName ?? right;
    if (leftName !== rightName) return leftName < rightName ? -1 : 1;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
  const picked: T[] = [];
  const limit = Number.isFinite(budget) ? budget : Number.MAX_SAFE_INTEGER;
  let index = 0;
  while (picked.length < limit) {
    let took = false;
    for (const projectId of projectIds) {
      const card = groups.get(projectId)?.[index];
      if (!card) continue;
      picked.push(card);
      took = true;
      if (picked.length >= limit) break;
    }
    if (!took) break;
    index += 1;
  }
  return picked;
}

/** Done steps over every step stored on the card. */
export function skillProgress(skillsJson: string | null): { done: number; total: number } {
  if (!skillsJson) return { done: 0, total: 0 };
  try {
    const parsed = JSON.parse(skillsJson) as { steps?: unknown };
    if (!Array.isArray(parsed.steps)) return { done: 0, total: 0 };
    let done = 0;
    let total = 0;
    for (const step of parsed.steps) {
      const row = step as SkillStep;
      if (typeof row.path !== "string") continue;
      total += 1;
      if (row.status === "done") done += 1;
    }
    return { done, total };
  } catch {
    return { done: 0, total: 0 };
  }
}

export function skillSteps(skillsJson: string | null): { path: string; status: string }[] {
  if (!skillsJson) return [];
  try {
    const parsed = JSON.parse(skillsJson) as { steps?: unknown };
    if (!Array.isArray(parsed.steps)) return [];
    return parsed.steps.flatMap((step) => {
      const row = step as SkillStep;
      if (typeof row.path !== "string") return [];
      return [{ path: row.path, status: typeof row.status === "string" ? row.status : "todo" }];
    });
  } catch {
    return [];
  }
}
