import { describe, expect, it } from "vitest";
import { BOARD_COLUMNS, BOARD_COLUMN_LABEL, boardCards, columnOf, nextSteps, skillProgress, toColumn, type StepCard } from "./board-model";

function placed(partial: {
  id: string;
  status?: string;
  stage?: string;
  position?: number;
  created_at?: number;
  done_at?: number | null;
}) {
  return {
    status: "todo",
    stage: "describe",
    position: 0,
    created_at: 1,
    done_at: null,
    ...partial,
  };
}

function step(partial: Partial<StepCard> & Pick<StepCard, "id">): StepCard {
  return {
    projectId: "proj-a",
    projectStatus: "active",
    projectName: "Alpha",
    status: "todo",
    stage: "describe",
    position: 0,
    createdAt: 1,
    blockedAnswered: false,
    hasSkill: true,
    ...partial,
  };
}

describe("boardCards", () => {
  it("puts a finished run card in Done and an open run card in Doing", () => {
    const columns = boardCards([
      placed({ id: "finished", status: "done", stage: "run", done_at: 20 }),
      placed({ id: "review", status: "todo", stage: "run" }),
    ]);
    expect(columns.done.map((card) => card.id)).toEqual(["finished"]);
    expect(columns.doing.map((card) => card.id)).toEqual(["review"]);
  });

  it("leaves a blocked describe card in To do", () => {
    const columns = boardCards([placed({ id: "stuck", status: "blocked", stage: "describe" })]);
    expect(columns.todo.map((card) => card.id)).toEqual(["stuck"]);
    expect(columns.done).toEqual([]);
  });

  it("orders equal positions by created time, then id", () => {
    const columns = boardCards([
      placed({ id: "b", position: 0, created_at: 2 }),
      placed({ id: "a", position: 0, created_at: 2 }),
      placed({ id: "c", position: 0, created_at: 1 }),
    ]);
    expect(columns.todo.map((card) => card.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps the 30 most recently finished cards", () => {
    const tasks = Array.from({ length: 31 }, (_, index) =>
      placed({ id: `done-${index}`, status: "done", stage: "run", done_at: index + 1 }),
    );
    const columns = boardCards(tasks);
    expect(columns.done).toHaveLength(30);
    expect(columns.done[0]?.id).toBe("done-30");
    expect(columns.done.some((card) => card.id === "done-0")).toBe(false);
  });
});

describe("four columns", () => {
  it("is To do, Doing, Waiting on Client Services, Done", () => {
    expect(BOARD_COLUMNS.map((column) => BOARD_COLUMN_LABEL[column])).toEqual(["To do", "Doing", "Waiting on Client Services", "Done"]);
  });

  it("maps describe to To do; engineer, build, and run to Doing; the review flag and done over any stage", () => {
    expect(columnOf({ status: "todo", stage: "describe" })).toBe("todo");
    expect(columnOf({ status: "blocked", stage: "describe" })).toBe("todo");
    for (const stage of ["engineer", "build", "run"]) expect(columnOf({ status: "todo", stage })).toBe("doing");
    expect(columnOf({ status: "doing", stage: "run", review_requested_at: 5 })).toBe("review");
    expect(columnOf({ status: "done", stage: "run", review_requested_at: 5 })).toBe("done");
    expect(columnOf({ status: "todo", stage: "odd" })).toBe("todo");
  });

  it("puts the live mix where staff expect it", () => {
    const columns = boardCards([
      ...Array.from({ length: 4 }, (_, index) => placed({ id: `d${index}`, stage: "describe", position: index })),
      placed({ id: "run-open", stage: "run" }),
      placed({ id: "run-done", stage: "run", status: "done", done_at: 9 }),
    ]);
    expect(columns.todo.map((card) => card.id)).toEqual(["d0", "d1", "d2", "d3"]);
    expect(columns.doing.map((card) => card.id)).toEqual(["run-open"]);
    expect(columns.review).toEqual([]);
    expect(columns.done.map((card) => card.id)).toEqual(["run-done"]);
  });

  it("takes the column names and the old stage names as move targets", () => {
    expect(["todo", "To do", "describe"].map(toColumn)).toEqual(["todo", "todo", "todo"]);
    expect(["doing", "engineer", "BUILD", "run"].map(toColumn)).toEqual(["doing", "doing", "doing", "doing"]);
    expect(toColumn("review")).toBe("review");
    expect(toColumn("done")).toBe("done");
    expect(toColumn("later")).toBeNull();
    expect(toColumn(3)).toBeNull();
  });
});

describe("nextSteps", () => {
  it("round-robins two projects and stops at 8", () => {
    const cards = [
      ...Array.from({ length: 8 }, (_, index) =>
        step({ id: `a-${index}`, projectId: "proj-a", projectName: "Alpha", position: index }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        step({ id: `b-${index}`, projectId: "proj-b", projectName: "Beta", position: index }),
      ),
    ];
    const picked = nextSteps(cards, 8).map((card) => card.id);
    expect(picked).toEqual(["a-0", "b-0", "a-1", "b-1", "a-2", "b-2", "a-3", "b-3"]);
  });

  it("skips a card with no project, a paused project, and a build card", () => {
    const picked = nextSteps(
      [
        step({ id: "loose", projectId: null }),
        step({ id: "paused", projectId: "proj-p", projectStatus: "paused", projectName: "Paused" }),
        step({ id: "building", stage: "build" }),
        step({ id: "ready", position: 0 }),
      ],
      8,
    ).map((card) => card.id);
    expect(picked).toEqual(["ready"]);
  });
});

describe("skillProgress", () => {
  it("counts finished steps and ignores a broken payload", () => {
    expect(skillProgress(JSON.stringify({ steps: [{ path: "a", status: "done" }, { path: "b", status: "todo" }] }))).toEqual({
      done: 1,
      total: 2,
    });
    expect(skillProgress("not json")).toEqual({ done: 0, total: 0 });
  });
});
