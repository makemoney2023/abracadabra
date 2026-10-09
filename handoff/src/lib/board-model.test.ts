import { describe, expect, it } from "vitest";
import { boardCards, nextSteps, skillProgress, type StepCard } from "./board-model";

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
  it("puts a finished run card in Done and an open run card in Run", () => {
    const columns = boardCards([
      placed({ id: "finished", status: "done", stage: "run", done_at: 20 }),
      placed({ id: "review", status: "todo", stage: "run" }),
    ]);
    expect(columns.done.map((card) => card.id)).toEqual(["finished"]);
    expect(columns.run.map((card) => card.id)).toEqual(["review"]);
  });

  it("leaves a blocked describe card in Describe", () => {
    const columns = boardCards([placed({ id: "stuck", status: "blocked", stage: "describe" })]);
    expect(columns.describe.map((card) => card.id)).toEqual(["stuck"]);
    expect(columns.done).toEqual([]);
  });

  it("orders equal positions by created time, then id", () => {
    const columns = boardCards([
      placed({ id: "b", position: 0, created_at: 2 }),
      placed({ id: "a", position: 0, created_at: 2 }),
      placed({ id: "c", position: 0, created_at: 1 }),
    ]);
    expect(columns.describe.map((card) => card.id)).toEqual(["c", "a", "b"]);
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
