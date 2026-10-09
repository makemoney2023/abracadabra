import { describe, expect, it } from "vitest";
import { sortRows } from "@/components/data-table-sort";
import { projectRows } from "./rows";

const now = 1_700_000_000_000;

describe("projectRows", () => {
  it("yields client, project, status, health, due, and open tasks", () => {
    expect(
      projectRows(
        [
          {
            id: "p1",
            organizationId: "o1",
            client: "North",
            name: "Site",
            status: "active",
            health: "on_track",
            dueAt: now,
          },
        ],
        [
          { projectId: "p1", status: "todo" },
          { projectId: "p1", status: "done" },
          { projectId: null, status: "todo" },
        ],
      ),
    ).toEqual([
      {
        id: "p1",
        clientId: "o1",
        client: "North",
        project: "Site",
        status: "active",
        health: "on_track",
        dueAt: now,
        openTasks: 1,
      },
    ]);
  });

  it("leaves a missing health blank and skips tasks from other projects", () => {
    const rows = projectRows(
      [
        {
          id: "p2",
          organizationId: "o2",
          client: "South",
          name: "Pause",
          status: "paused",
          health: null,
          dueAt: null,
        },
      ],
      [{ projectId: "other", status: "doing" }],
    );
    expect(rows[0]?.health).toBeNull();
    expect(rows[0]?.dueAt).toBeNull();
    expect(rows[0]?.openTasks).toBe(0);
  });

  it("sorts undated projects last when the due column is sorted", () => {
    const rows = projectRows(
      [
        {
          id: "open",
          organizationId: "o",
          client: "A",
          name: "Open",
          status: "active",
          health: null,
          dueAt: null,
        },
        {
          id: "dated",
          organizationId: "o",
          client: "A",
          name: "Dated",
          status: "active",
          health: null,
          dueAt: now,
        },
      ],
      [],
    );
    const sorted = sortRows(rows, "due", (row, key) => (key === "due" ? row.dueAt : row.project));
    expect(sorted.map((row) => row.id)).toEqual(["dated", "open"]);
  });
});
