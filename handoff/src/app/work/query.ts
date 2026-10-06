export function workHref(input: {
  late?: boolean;
  week?: boolean;
  blocked?: boolean;
  group?: "person" | "client";
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
