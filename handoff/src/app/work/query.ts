const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkCount = {
  all: number;
  late: number;
  thisWeek: number;
  blocked: number;
};

type CountedTask = {
  status: string;
  due_at: number | null;
};

function isLate(task: CountedTask, now: number): boolean {
  return task.due_at !== null && task.due_at < now;
}

function isThisWeek(task: CountedTask, now: number): boolean {
  return task.due_at !== null && task.due_at >= now && task.due_at <= now + WEEK_MS;
}

/** Counts for the work filters. A task due before `now` is late and not this week. */
export function workCounts(tasks: CountedTask[], now: number): WorkCount {
  let late = 0;
  let thisWeek = 0;
  let blocked = 0;
  for (const task of tasks) {
    if (isLate(task, now)) late += 1;
    if (isThisWeek(task, now)) thisWeek += 1;
    if (task.status === "blocked") blocked += 1;
  }
  return { all: tasks.length, late, thisWeek, blocked };
}

/** Keeps tasks that match the active filters. `density` is not a filter. */
export function filterWork<T extends CountedTask>(
  tasks: T[],
  filter: { late?: boolean; week?: boolean; blocked?: boolean },
  now: number,
): T[] {
  return tasks.filter((task) => {
    if (filter.late && !isLate(task, now)) return false;
    if (filter.week && !isThisWeek(task, now)) return false;
    if (filter.blocked && task.status !== "blocked") return false;
    return true;
  });
}

export function workHref(input: {
  late?: boolean;
  week?: boolean;
  blocked?: boolean;
  group?: "person" | "client";
  /** Ignored. Row density follows the staff setting, not the URL. */
  density?: string;
}): string {
  const search = new URLSearchParams();
  if (input.late) search.set("late", "1");
  if (input.week) search.set("week", "1");
  if (input.blocked) search.set("blocked", "1");
  if (input.group === "client") search.set("group", "client");
  const text = search.toString();
  return text.length > 0 ? `/work?${text}` : "/work";
}

export function groupTasks<T extends { assignee_email: string | null; organization_name: string }>(
  tasks: T[],
  by: "person" | "client",
): { label: string; tasks: T[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const task of tasks) {
    const label = by === "person" ? (task.assignee_email ?? "Unassigned") : task.organization_name;
    const bucket = buckets.get(label);
    if (bucket) {
      bucket.push(task);
    } else {
      buckets.set(label, [task]);
      order.push(label);
    }
  }
  return order.map((label) => ({ label, tasks: buckets.get(label) ?? [] }));
}
