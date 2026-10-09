import { describe, expect, it } from "vitest";
import type { TodayBoard, WorkTask } from "@/db/crm";
import {
  activityItems,
  clientsAtRisk,
  greeting,
  greetingName,
  needsYou,
  pipelineCounts,
  timelineFilter,
  todayFeed,
  todayKicker,
  todayMetrics,
} from "./today-view";

const NOW = Date.UTC(2026, 9, 9, 15, 0, 0);
const WEEK = 7 * 24 * 60 * 60 * 1000;

function task(partial: Partial<WorkTask> & Pick<WorkTask, "id" | "title" | "status">): WorkTask {
  return {
    organization_id: "org-1",
    organization_name: "Harbor",
    due_at: null,
    done_at: null,
    project_id: null,
    milestone_id: null,
    assignee_user_id: null,
    assignee_email: null,
    stage: "describe",
    position: 0,
    blocked_reason: null,
    skills_json: null,
    round: 1,
    created_by_kind: "staff",
    cursor_agent_id: null,
    created_at: NOW,
    project_name: null,
    project_status: null,
    ...partial,
  };
}

function board(partial: Partial<TodayBoard> = {}): TodayBoard {
  return {
    newLeads: [],
    calls: [],
    tasks: [],
    stalledDeals: [],
    waitingSpaces: [],
    invoices: [],
    agentNotes: [],
    agentActivity: [],
    workRequests: [],
    ...partial,
  };
}

describe("todayMetrics", () => {
  it("lists needs you, late, blocked, due this week, and active clients", () => {
    const metrics = todayMetrics(
      board({
        tasks: [
          task({ id: "late", title: "Late", status: "todo", due_at: NOW - 1 }),
          task({ id: "blocked", title: "Blocked", status: "blocked", due_at: NOW + WEEK }),
          task({ id: "week", title: "Soon", status: "doing", due_at: NOW + 1 }),
        ],
        workRequests: [
          { id: "ask", organizationId: "org-1", organizationName: "Harbor", body: "Need a file", channel: "email" },
        ],
      }),
      NOW,
      4,
    );

    expect(metrics.map((metric) => metric.label)).toEqual([
      "Needs you",
      "Late",
      "Blocked",
      "Due this week",
      "Active clients",
    ]);
    expect(metrics.map((metric) => metric.href)).toEqual([
      "/work",
      "/work?late=1",
      "/work?blocked=1",
      "/work?week=1",
      "/clients",
    ]);
    expect(metrics.map((metric) => metric.value)).toEqual([3, 1, 1, 2, 4]);
    expect(metrics.map((metric) => metric.tone)).toEqual(["late", "late", "blocked", "waiting", "active"]);
  });
});

describe("needsYou", () => {
  it("returns at most 8, late before blocked before waiting", () => {
    const tasks = [
      task({ id: "blocked", title: "Blocked", status: "blocked", due_at: NOW + WEEK }),
      task({ id: "late", title: "Late", status: "todo", due_at: NOW - 1 }),
      ...Array.from({ length: 8 }, (_, index) =>
        task({
          id: `late-${index}`,
          title: `Late ${index}`,
          status: "todo",
          due_at: NOW - 2 - index,
        }),
      ),
    ];
    const rows = needsYou(
      board({
        tasks,
        workRequests: [
          { id: "wait", organizationId: "org-1", organizationName: "Harbor", body: "Waiting", channel: "email" },
        ],
      }),
      8,
      NOW,
    );

    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.tone === "late")).toBe(true);
    expect(rows.some((row) => row.id === "blocked" || row.id === "wait")).toBe(false);
  });

  it("keeps a blocked task ahead of a waiting request when nothing is late", () => {
    const rows = needsYou(
      board({
        tasks: [task({ id: "blocked", title: "Blocked", status: "blocked", due_at: NOW + 1 })],
        workRequests: [
          { id: "wait", organizationId: "org-1", organizationName: "Harbor", body: "Waiting", channel: "email" },
        ],
      }),
      8,
      NOW,
    );
    expect(rows.map((row) => row.tone)).toEqual(["blocked", "waiting"]);
  });
});

describe("timelineFilter", () => {
  it("keeps only agent items", () => {
    const items = activityItems(
      board({
        newLeads: [{ id: "lead", title: "North", organizationId: "org-2", organizationName: "North" }],
        agentActivity: [
          {
            id: "run",
            kind: "swarm.run",
            body: null,
            status: "done",
            createdAt: NOW,
            organizationId: null,
            organizationName: "",
            reportUrl: null,
            artifacts: [],
          },
        ],
      }),
    );
    expect(timelineFilter(items, "agent").map((item) => item.id)).toEqual(["run"]);
    expect(timelineFilter(items, "leads").map((item) => item.id)).toEqual(["lead"]);
    expect(timelineFilter(items, "all")).toHaveLength(2);
  });
});

describe("greeting", () => {
  it("says good morning, afternoon, or evening and includes the first name", () => {
    expect(greeting(new Date(Date.UTC(2026, 9, 9, 8)), "Ada Lovelace")).toBe("Good morning, Ada");
    expect(greeting(new Date(Date.UTC(2026, 9, 9, 14)))).toBe("Good afternoon");
    expect(greeting(new Date(Date.UTC(2026, 9, 9, 19)), "  ")).toBe("Good evening");
  });
});

describe("todayFeed", () => {
  it("keeps a known filter and drops anything else", () => {
    expect(todayFeed("agent")).toBe("agent");
    expect(todayFeed("nope")).toBe("all");
    expect(todayFeed(undefined)).toBe("all");
  });
});

describe("greetingName", () => {
  it("uses the first word of the email name", () => {
    expect(greetingName("ada.lovelace@studio.test")).toBe("Ada");
    expect(greetingName("")).toBeUndefined();
    expect(greetingName(null)).toBeUndefined();
  });
});

describe("today helpers", () => {
  it("formats the day kicker in UTC and drops healthy clients", () => {
    expect(todayKicker(new Date(NOW))).toBe("Friday, Oct 9");
    expect(
      pipelineCounts([
        { stage: "new" },
        { stage: "new" },
        { stage: "won" },
      ]).find((row) => row.stage === "new")?.count,
    ).toBe(2);
    expect(
      clientsAtRisk([
        { id: "a", name: "Harbor", health: "on_track" },
        { id: "b", name: "North", health: "off_track" },
      ]),
    ).toEqual([{ id: "b", name: "North", health: "off_track" }]);
  });
});
