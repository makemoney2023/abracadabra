import { describe, expect, it } from "vitest";
import type { TodayBoard, WorkTask } from "@/db/crm";
import {
  clientsAtRisk,
  greeting,
  greetingName,
  needsYou,
  pipelineCounts,
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
    workRequests: [],
    events: [],
    wakeAlerts: [],
    reviewWaiting: [],
    pipeline: [],
    clients: [],
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
    expect(rows[0]?.href).toBe("/clients/org-1?tab=work");
  });

  it("opens a project card on that project's board", () => {
    const rows = needsYou(
      board({
        tasks: [task({ id: "mine", title: "Mine", status: "todo", due_at: NOW - 1, project_id: "proj-1" })],
      }),
      8,
      NOW,
    );
    expect(rows[0]?.href).toBe("/projects/proj-1");
  });
});

describe("needsYou alerts", () => {
  const HOUR = 60 * 60 * 1000;

  it("puts wake alerts, failed deploys, inquiries and stale review cards ahead of late tasks", () => {
    const rows = needsYou(
      board({
        tasks: [task({ id: "late", title: "Late", status: "todo", due_at: NOW - 1 })],
        wakeAlerts: [
          { organizationId: "org-1", organizationName: "Harbor", parentOrganizationId: null, failures: 6, lastAt: NOW - HOUR, lastError: "Wake returned 500." },
        ],
        reviewWaiting: [
          { taskId: "t1", title: "Quote export", organizationId: "org-1", organizationName: "Harbor", parentOrganizationId: null, projectId: "p1", since: NOW - 5 * HOUR },
          { taskId: "t2", title: "Fresh", organizationId: "org-1", organizationName: "Harbor", parentOrganizationId: null, projectId: "p1", since: NOW - HOUR },
        ],
        events: [
          {
            id: "inq",
            kind: "project_inquiry",
            actorKind: "system",
            actorId: null,
            body: "Asked about a project on the website (Product).",
            data: {},
            createdAt: NOW - 2 * HOUR,
            organizationId: "org-2",
            organizationName: "North",
            parentOrganizationId: null,
            projectId: null,
            taskId: null,
            taskTitle: null,
          },
        ],
      }),
      12,
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["wake:org-1", "inq", "review:t1", "late"]);
    expect(rows[0]).toMatchObject({ tone: "late", client: "Harbor", at: NOW - HOUR });
  });

  it("counts every alert in the Needs you metric", () => {
    const metrics = todayMetrics(
      board({
        wakeAlerts: [
          { organizationId: "org-1", organizationName: "Harbor", parentOrganizationId: null, failures: 2, lastAt: NOW - HOUR, lastError: null },
        ],
        stalledDeals: [
          { id: "deal-1", title: "Site", organizationId: "org-1", organizationName: "Harbor", nextStep: "Call back", nextStepAt: NOW - HOUR },
        ],
        waitingSpaces: [{ id: "ws-1", slug: "harbor", displayName: "Harbor", requestTitle: "Logo", dueOn: NOW - HOUR }],
      }),
      NOW,
    );
    expect(metrics[0]).toMatchObject({ label: "Needs you", value: 3 });
  });
});

describe("greeting", () => {
  it("says good morning, afternoon, or evening in Toronto time and includes the first name", () => {
    // Toronto is UTC-4 in October.
    expect(greeting(new Date(Date.UTC(2026, 9, 9, 13)), "Ada Lovelace")).toBe("Good morning, Ada");
    expect(greeting(new Date(Date.UTC(2026, 9, 9, 17)))).toBe("Good afternoon");
    expect(greeting(new Date(Date.UTC(2026, 9, 9, 20)))).toBe("Good afternoon");
    expect(greeting(new Date(Date.UTC(2026, 9, 9, 22)), "  ")).toBe("Good evening");
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
  it("formats the day kicker in Toronto time and drops healthy clients", () => {
    expect(todayKicker(new Date(NOW))).toBe("Friday, Oct 9");
    // 1 AM UTC on Oct 10 is still Oct 9 in Toronto.
    expect(todayKicker(new Date(Date.UTC(2026, 9, 10, 1)))).toBe("Friday, Oct 9");
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
