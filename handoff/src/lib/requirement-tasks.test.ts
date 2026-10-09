import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { askRequirementModel, fileRequirementTasks, tasksFromRequirementModel } from "./requirement-tasks";

const NOW = 1_700_000_000_000;

const staff: Caller = {
  userId: "staff-1",
  staff: { superAdmin: false },
  operatorOf: [],
  memberships: [],
};

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at)
     VALUES ('org-1', 'AbraCadabra', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (id, organization_id, name, status, description, created_at, updated_at)
     VALUES ('proj-1', 'org-1', 'Social Media Ads', 'planned', NULL, ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

describe("tasksFromRequirementModel", () => {
  it("reads task titles from a JSON object", () => {
    expect(
      tasksFromRequirementModel(
        '{"tasks":[{"title":"Landing page"},{"title":"Three ad sizes"}]}',
      ),
    ).toEqual(["Landing page", "Three ad sizes"]);
  });

  it("reads fenced JSON and drops blanks, repeats, and extras past eight", () => {
    const titles = Array.from({ length: 10 }, (_, index) => `Task ${index + 1}`);
    const raw = `\`\`\`json\n${JSON.stringify({
      tasks: ["", "Landing page", "landing page", ...titles],
    })}\n\`\`\``;
    expect(tasksFromRequirementModel(raw)).toEqual(["Landing page", ...titles.slice(0, 7)]);
  });

  it("returns nothing when the model does not send tasks", () => {
    expect(tasksFromRequirementModel("I would start with a landing page.")).toEqual([]);
    expect(tasksFromRequirementModel('{"tasks":[]}')).toEqual([]);
  });
});

describe("askRequirementModel", () => {
  it("reads the model text and returns nothing when the binding is missing", async () => {
    expect(await askRequirementModel(undefined, "Plan this.")).toBe("");
    const answer = await askRequirementModel(
      {
        run: async () => ({ response: '{"tasks":[{"title":"Three ad sizes"}]}' }),
      },
      "Plan this.",
    );
    expect(answer).toBe('{"tasks":[{"title":"Three ad sizes"}]}');
  });
});

describe("fileRequirementTasks", () => {
  it("adds the tasks the model names and skips ones already on the project", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO tasks (
         id, project_id, organization_id, title, status, stage, position, created_at, updated_at
       ) VALUES ('task-1', 'proj-1', 'org-1', 'Landing page', 'todo', 'describe', 0, ?, ?)`,
      [NOW, NOW],
    );
    const prompts: string[] = [];
    const filed = await fileRequirementTasks({
      sql,
      caller: staff,
      projectId: "proj-1",
      requirements: "A landing page and three ad sizes.",
      ask: async (prompt) => {
        prompts.push(prompt);
        return '{"tasks":[{"title":"Landing page"},{"title":"Three ad sizes"}]}';
      },
      now: NOW + 1,
    });
    expect(filed).toEqual({ created: ["Three ad sizes"], reason: "added" });
    expect(prompts[0]).toContain("A landing page and three ad sizes.");
    expect(prompts[0]).toContain("Landing page");
    const rows = await sql.all<{ title: string; stage: string; created_by_kind: string }>(
      "SELECT title, stage, created_by_kind FROM tasks WHERE project_id = 'proj-1' ORDER BY position",
    );
    expect(rows).toEqual([
      { title: "Landing page", stage: "describe", created_by_kind: "staff" },
      { title: "Three ad sizes", stage: "describe", created_by_kind: "staff" },
    ]);
  });

  it("does not ask the model when the note is empty", async () => {
    const sql = await database();
    const filed = await fileRequirementTasks({
      sql,
      caller: staff,
      projectId: "proj-1",
      requirements: "   ",
      ask: async () => {
        throw new Error("should not ask");
      },
      now: NOW,
    });
    expect(filed).toEqual({ created: [], reason: "cleared" });
  });

  it("keeps the note when the model does not answer", async () => {
    const sql = await database();
    const filed = await fileRequirementTasks({
      sql,
      caller: staff,
      projectId: "proj-1",
      requirements: "Three ad sizes.",
      ask: async () => {
        throw new Error("offline");
      },
      now: NOW,
    });
    expect(filed).toEqual({ created: [], reason: "unread" });
    expect(await sql.all("SELECT id FROM tasks")).toEqual([]);
  });
});
