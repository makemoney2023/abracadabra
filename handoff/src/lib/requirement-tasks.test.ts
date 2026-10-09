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
  it("reads a title and the detail the model wrote for it", () => {
    expect(
      tasksFromRequirementModel(
        '{"tasks":[{"title":"Landing page","detail":"One page that states the offer."},{"title":"Three ad sizes","detail":"Square, story, and landscape."}]}',
      ),
    ).toEqual([
      { title: "Landing page", detail: "One page that states the offer." },
      { title: "Three ad sizes", detail: "Square, story, and landscape." },
    ]);
  });

  it("reads fenced JSON and drops blanks, repeats, and extras past eight", () => {
    const titles = Array.from({ length: 10 }, (_, index) => `Task ${index + 1}`);
    const raw = `\`\`\`json\n${JSON.stringify({
      tasks: ["", "Landing page", "landing page", ...titles],
    })}\n\`\`\``;
    expect(tasksFromRequirementModel(raw)).toEqual([
      { title: "Landing page", detail: "" },
      ...titles.slice(0, 7).map((title) => ({ title, detail: "" })),
    ]);
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
        return JSON.stringify({
          tasks: [
            { title: "Landing page", detail: "One page that states the offer." },
            { title: "Three ad sizes", detail: "Square, story, and landscape." },
          ],
        });
      },
      now: NOW + 1,
    });
    expect(filed).toEqual({
      created: [],
      detailed: ["Landing page"],
      reason: "added",
    });
    expect(prompts[0]).toContain("A landing page and three ad sizes.");
    expect(prompts[0]).toContain("Landing page");
    const rows = await sql.all<{ title: string; stage: string; created_by_kind: string }>(
      "SELECT title, stage, created_by_kind FROM tasks WHERE project_id = 'proj-1' ORDER BY position",
    );
    expect(rows).toEqual([{ title: "Landing page", stage: "describe", created_by_kind: "staff" }]);
    const notes = await sql.all<{ body: string; task_id: string; kind: string }>(
      `SELECT body, json_extract(data_json, '$.taskId') AS task_id, kind
       FROM activities WHERE kind = 'agent.task_brief' ORDER BY body`,
    );
    expect(notes).toEqual([
      { body: "One page that states the offer.", task_id: "task-1", kind: "agent.task_brief" },
    ]);
  });

  it("does not add a rephrased task when the project already has cards", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO tasks (
         id, project_id, organization_id, title, status, stage, position, created_at, updated_at
       ) VALUES ('task-1', 'proj-1', 'org-1', 'Define video prompts', 'todo', 'describe', 0, ?, ?)`,
      [NOW, NOW],
    );
    const filed = await fileRequirementTasks({
      sql,
      caller: staff,
      projectId: "proj-1",
      requirements: "Video animation prompts.",
      ask: async () =>
        JSON.stringify({
          tasks: [{ title: "Create video posts", detail: "Animation prompts for each video post." }],
        }),
      now: NOW + 1,
    });
    expect(filed).toEqual({ created: [], detailed: ["Define video prompts"], reason: "added" });
    const titles = await sql.all<{ title: string }>("SELECT title FROM tasks WHERE project_id = 'proj-1'");
    expect(titles).toEqual([{ title: "Define video prompts" }]);
    const note = await sql.get<{ body: string }>(
      "SELECT body FROM activities WHERE kind = 'agent.task_brief' AND json_extract(data_json, '$.taskId') = 'task-1'",
    );
    expect(note?.body).toBe("Animation prompts for each video post.");
  });

  it("creates tasks with details when the project has none", async () => {
    const sql = await database();
    const filed = await fileRequirementTasks({
      sql,
      caller: staff,
      projectId: "proj-1",
      requirements: "A landing page and three ad sizes.",
      ask: async () =>
        JSON.stringify({
          tasks: [
            { title: "Landing page", detail: "One page that states the offer." },
            { title: "Three ad sizes", detail: "Square, story, and landscape." },
          ],
        }),
      now: NOW,
    });
    expect(filed.created).toEqual(["Landing page", "Three ad sizes"]);
    expect(filed.detailed).toEqual(["Landing page", "Three ad sizes"]);
    expect(await sql.all("SELECT title FROM tasks ORDER BY position")).toEqual([
      { title: "Landing page" },
      { title: "Three ad sizes" },
    ]);
    expect(await sql.all("SELECT body FROM activities WHERE kind = 'agent.task_brief' ORDER BY body")).toEqual([
      { body: "One page that states the offer." },
      { body: "Square, story, and landscape." },
    ]);
  });

  it("does not write a second brief when the detail is unchanged", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO tasks (
         id, project_id, organization_id, title, status, stage, position, created_at, updated_at
       ) VALUES ('task-1', 'proj-1', 'org-1', 'Landing page', 'todo', 'describe', 0, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, project_id, kind, actor_kind, body, data_json, created_at
       ) VALUES ('note-1', 'org-1', 'proj-1', 'agent.task_brief', 'agent', 'One page that states the offer.', ?, ?)`,
      [JSON.stringify({ taskId: "task-1" }), NOW],
    );
    const filed = await fileRequirementTasks({
      sql,
      caller: staff,
      projectId: "proj-1",
      requirements: "A landing page.",
      ask: async () =>
        JSON.stringify({ tasks: [{ title: "Landing page", detail: "One page that states the offer." }] }),
      now: NOW + 1,
    });
    expect(filed).toEqual({ created: [], detailed: [], reason: "none" });
    expect(await sql.all("SELECT id FROM activities WHERE kind = 'agent.task_brief'")).toEqual([{ id: "note-1" }]);
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
    expect(filed).toEqual({ created: [], detailed: [], reason: "cleared" });
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
    expect(filed).toEqual({ created: [], detailed: [], reason: "unread" });
    expect(await sql.all("SELECT id FROM tasks")).toEqual([]);
  });
});
