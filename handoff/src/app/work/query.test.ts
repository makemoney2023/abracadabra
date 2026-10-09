import { describe, expect, it } from "vitest";
import { filterWork, groupTasks, workCounts, workHref } from "./query";

describe("workHref", () => {
  it("keeps the plain work page when nothing is filtered", () => {
    expect(workHref({})).toBe("/work");
    expect(workHref({ group: "person" })).toBe("/work");
  });

  it("keeps late, this week, blocked, and client grouping in the query", () => {
    expect(workHref({ late: true })).toBe("/work?late=1");
    expect(workHref({ week: true, blocked: true, group: "client" })).toBe("/work?week=1&blocked=1&group=client");
  });

  it("drops a density key", () => {
    expect(workHref({ density: "compact" })).toBe("/work");
    expect(workHref({ late: true, density: "compact", group: "client" })).toBe("/work?late=1&group=client");
  });
});

describe("workCounts", () => {
  const now = 1_700_000_000_000;
  const day = 24 * 60 * 60 * 1000;

  it("counts every open task, late tasks, this week, and blocked", () => {
    expect(
      workCounts(
        [
          { status: "todo", due_at: now + day },
          { status: "blocked", due_at: now + 2 * day },
          { status: "doing", due_at: null },
        ],
        now,
      ),
    ).toEqual({ all: 3, late: 0, thisWeek: 2, blocked: 1 });
  });

  it("counts a task due yesterday as late and not this week", () => {
    expect(workCounts([{ status: "todo", due_at: now - day }], now)).toEqual({
      all: 1,
      late: 1,
      thisWeek: 0,
      blocked: 0,
    });
    expect(workCounts([], now)).toEqual({ all: 0, late: 0, thisWeek: 0, blocked: 0 });
  });
});

describe("filterWork", () => {
  const now = 1_700_000_000_000;
  const day = 24 * 60 * 60 * 1000;
  const tasks = [
    { id: "late", status: "todo", due_at: now - day },
    { id: "soon", status: "doing", due_at: now + day },
    { id: "blocked", status: "blocked", due_at: now + 2 * day },
  ];

  it("keeps a task due yesterday on Late and leaves it off This week", () => {
    expect(filterWork(tasks, { late: true }, now).map((task) => task.id)).toEqual(["late"]);
    expect(filterWork(tasks, { week: true }, now).map((task) => task.id)).toEqual(["soon", "blocked"]);
    expect(filterWork(tasks, {}, now)).toEqual(tasks);
  });
});

describe("groupTasks", () => {
  const tasks = [
    { title: "Mine", assignee_email: "ada@example.com", organization_name: "Harbor" },
    { title: "Loose", assignee_email: null, organization_name: "Harbor" },
    { title: "Theirs", assignee_email: "bea@example.com", organization_name: "Pine" },
  ];

  it("groups by person and keeps the incoming order", () => {
    expect(groupTasks(tasks, "person").map((group) => group.label)).toEqual([
      "ada@example.com",
      "Unassigned",
      "bea@example.com",
    ]);
    expect(groupTasks(tasks, "person")[0]?.tasks.map((task) => task.title)).toEqual(["Mine"]);
  });

  it("groups by client", () => {
    const groups = groupTasks(tasks, "client");
    expect(groups.map((group) => group.label)).toEqual(["Harbor", "Pine"]);
    expect(groups[0]?.tasks.map((task) => task.title)).toEqual(["Mine", "Loose"]);
  });
});
