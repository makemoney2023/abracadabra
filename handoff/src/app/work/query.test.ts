import { describe, expect, it } from "vitest";
import { groupTasks, workHref } from "./query";

describe("workHref", () => {
  it("keeps the plain work page when nothing is filtered", () => {
    expect(workHref({})).toBe("/work");
    expect(workHref({ group: "person" })).toBe("/work");
  });

  it("keeps late, this week, blocked, and client grouping in the query", () => {
    expect(workHref({ late: true })).toBe("/work?late=1");
    expect(workHref({ week: true, blocked: true, group: "client" })).toBe("/work?week=1&blocked=1&group=client");
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
