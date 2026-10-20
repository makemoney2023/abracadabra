import { describe, expect, it } from "vitest";
import {
  BURST_MS,
  FEED_PAGE,
  REVIEW_WAIT_MS,
  agentWork,
  agentWorkStats,
  clientChoices,
  dayGroup,
  eventNeeds,
  feedQuery,
  filterFeed,
  fyiRows,
  pageRows,
  reviewNeeds,
  torontoHour,
  unreadCount,
  wakeNeeds,
  type FeedEvent,
} from "./today-feed";

// Tue Oct 20 2026, 5:00 PM in Toronto (21:00 UTC).
const NOW = Date.UTC(2026, 9, 20, 21, 0, 0);
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

let seq = 0;
function ev(partial: Partial<FeedEvent> & Pick<FeedEvent, "kind">): FeedEvent {
  seq += 1;
  return {
    id: `a-${seq}`,
    actorKind: "system",
    actorId: null,
    body: null,
    data: {},
    createdAt: NOW - HOUR,
    organizationId: "org-renew",
    organizationName: "Renew Implants",
    parentOrganizationId: null,
    projectId: null,
    taskId: null,
    taskTitle: null,
    ...partial,
  };
}

describe("Toronto time", () => {
  it("groups by the Toronto day, not the UTC day", () => {
    // 9:30 PM Toronto on Oct 19 is already Oct 20 in UTC.
    const lateEvening = Date.UTC(2026, 9, 20, 1, 30);
    expect(dayGroup(lateEvening, NOW)).toBe("Yesterday");
    // 1 AM Toronto on Oct 20.
    expect(dayGroup(Date.UTC(2026, 9, 20, 5, 0), NOW)).toBe("Today");
    expect(dayGroup(Date.UTC(2026, 9, 18, 15, 0), NOW)).toBe("Earlier");
  });

  it("reads the hour in Toronto", () => {
    expect(torontoHour(NOW)).toBe(17);
    expect(torontoHour(Date.UTC(2026, 9, 20, 13, 0))).toBe(9);
  });
});

describe("schema scans", () => {
  it("shows one row per scan with its latest state", () => {
    const rows = fyiRows(
      [
        ev({ kind: "schema.scan", createdAt: NOW - 50 * MIN, body: "Schema scan finished for strongfoam.com. Score 90.", data: { scanId: "s1", status: "complete", domain: "strongfoam.com", score: 90 } }),
        ev({ kind: "schema.scan", createdAt: NOW - 55 * MIN, body: "Schema scan started for strongfoam.com.", data: { scanId: "s1", status: "queued", domain: "strongfoam.com" } }),
      ],
      [],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Schema scan complete for strongfoam.com", body: "Score 90", type: "leads", count: 1 });
  });
});

describe("bursts", () => {
  it("folds a pull request's opened, merged and push events into one row", () => {
    const data = { number: 10, repo: "makemoney2023/renewimplants", title: "Publish Wave 2" };
    const rows = fyiRows(
      [
        ev({ kind: "push", createdAt: NOW - 2 * HOUR, data: { repo: data.repo }, body: "Pushed to main" }),
        ev({ kind: "pr_merged", createdAt: NOW - 2 * HOUR, data, body: "Merged pull request #10" }),
        ev({ kind: "pr_opened", createdAt: NOW - 3 * HOUR, data, body: "Opened pull request #10" }),
      ],
      [],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "PR #10 Publish Wave 2", body: "opened → merged → pushed · makemoney2023/renewimplants", type: "system", count: 3 });
  });

  it("groups deploys to one repo inside the burst window and counts failures", () => {
    const repo = { repo: "makemoney2023/renewimplants" };
    const rows = fyiRows(
      [
        ev({ kind: "deploy", createdAt: NOW - 1 * HOUR, data: repo, body: "Deploy succeeded in makemoney2023/renewimplants by someone" }),
        ev({ kind: "deploy", createdAt: NOW - 1.5 * HOUR, data: repo, body: "Deploy failed in makemoney2023/renewimplants by someone" }),
        ev({ kind: "deploy", createdAt: NOW - 2 * HOUR, data: repo, body: "Deploy succeeded in makemoney2023/renewimplants by someone" }),
        ev({ kind: "deploy", createdAt: NOW - 2 * HOUR - BURST_MS - MIN, data: repo, body: "Deploy succeeded in makemoney2023/renewimplants by someone" }),
      ],
      [],
      NOW,
    );
    expect(rows.map((row) => [row.title, row.body, row.count])).toEqual([
      ["3 deploys to renewimplants", "1 failed", 3],
      ["Deploy succeeded", "makemoney2023/renewimplants", 1],
    ]);
  });

  it("shows consecutive board moves on one card as one row with the task title", () => {
    const task = { taskId: "t1", taskTitle: "Quote export" };
    const rows = fyiRows(
      [
        ev({ kind: "agent.task_stage", actorKind: "agent", createdAt: NOW - 10 * MIN, ...task, body: "Moved to done.", data: { taskId: "t1", column: "done" } }),
        ev({ kind: "client_agent.board", actorKind: "agent", createdAt: NOW - 30 * MIN, ...task, body: "StrongFoam CRM/ERP: \"Quote export\" is ready for review.", data: { action: "review", task_id: "t1" } }),
        ev({ kind: "agent.task_stage", actorKind: "agent", createdAt: NOW - 30 * MIN, ...task, body: "Moved to Waiting on Client Services.", data: { taskId: "t1", column: "review" } }),
        ev({ kind: "agent.task_stage", actorKind: "agent", createdAt: NOW - 50 * MIN, ...task, body: "Moved to Doing.", data: { taskId: "t1", column: "doing" } }),
      ],
      [],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "\u201cQuote export\u201d moved to Done",
      body: "Doing → Waiting on Client Services → Done",
      type: "agent",
    });
  });

  it("names the task on a single move", () => {
    const rows = fyiRows(
      [ev({ kind: "agent.task_stage", actorKind: "agent", taskId: "t9", taskTitle: "Site audit", body: "Moved to done.", data: { taskId: "t9", column: "done" } })],
      [],
      NOW,
    );
    expect(rows[0]?.title).toBe("\u201cSite audit\u201d moved to Done");
  });

  it("groups the same kind on one client inside the window", () => {
    const rows = fyiRows(
      [
        ev({ kind: "client_agent.assigned", actorKind: "agent", organizationName: "Strong Foam", createdAt: NOW - 20 * MIN, body: "Client agent strongfoam assigned as hire." }),
        ev({ kind: "client_agent.assigned", actorKind: "agent", organizationName: "Strong Foam", createdAt: NOW - 21 * MIN, body: "Client agent strongfoam-crm-erp assigned as lead." }),
      ],
      [],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "2 agent assignments", body: "Client agent strongfoam assigned as hire.", count: 2 });
  });

  it("bursts a holding group's companies together and names the group", () => {
    const rows = fyiRows(
      [
        ev({ kind: "note", actorKind: "staff", organizationId: "sf", organizationName: "Strong Foam", parentOrganizationId: "lio", parentOrganizationName: "LioCorr", createdAt: NOW - 10 * MIN, body: "Now part of LioCorr." }),
        ev({ kind: "note", actorKind: "staff", organizationId: "lio", organizationName: "LioCorr", createdAt: NOW - 11 * MIN, body: "Added Strong Foam to the group." }),
        ev({ kind: "note", actorKind: "system", organizationId: "ev", organizationName: "Everleigh", parentOrganizationId: "lio", parentOrganizationName: "LioCorr", createdAt: NOW - 12 * MIN, body: "Added as an existing client." }),
        ev({ kind: "note", actorKind: "system", organizationId: "renew", organizationName: "Renew", createdAt: NOW - 13 * MIN, body: "Other client." }),
      ],
      [],
      NOW,
    );
    expect(rows.map((row) => [row.title, row.body, row.client, row.organizationId])).toEqual([
      ["Now part of LioCorr.", "+2 more notes", "LioCorr (group)", "lio"],
      ["Other client.", undefined, "Renew", "renew"],
    ]);
    // Picking one company still finds the group row it is part of.
    expect(filterFeed(rows, { client: "ev" }).map((row) => row.client)).toEqual(["LioCorr (group)"]);
  });

  it("hides old swarm, deleted-task and duplicate email rows", () => {
    const rows = fyiRows(
      [
        ev({ kind: "agent.swarm_run", actorKind: "agent", body: "Swarm run x is still going." }),
        ev({ kind: "task_deleted", actorKind: "staff", body: "video" }),
        ev({ kind: "pipeline.started", actorKind: "staff", body: "parallel-web-search" }),
        ev({ kind: "email", body: "Opened from an email to magic@." }),
        ev({ kind: "note", actorKind: "staff", body: null }),
        ev({ kind: "agent.wake_failed", body: "Wake returned 500." }),
      ],
      [],
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it("adds dated new leads and skips leads older than a week", () => {
    const rows = fyiRows(
      [],
      [
        { id: "d1", title: "Harbor site", organizationId: "o1", organizationName: "Harbor", parentOrganizationId: null, createdAt: NOW - 2 * HOUR },
        { id: "d2", title: "Old site", organizationId: "o2", organizationName: "Pine", parentOrganizationId: null, createdAt: NOW - 9 * 24 * HOUR },
      ],
      NOW,
    );
    expect(rows.map((row) => [row.title, row.type, row.at])).toEqual([["New lead: Harbor site", "leads", NOW - 2 * HOUR]]);
  });
});

describe("needs you from events", () => {
  it("lists unanswered inquiries and client messages, and drops answered ones", () => {
    const open = ev({ kind: "project_inquiry", organizationId: "o1", organizationName: "Harbor", createdAt: NOW - 3 * HOUR, body: "Asked about a project on the website (Product)." });
    const answered = ev({ kind: "client.message", organizationId: "o2", organizationName: "Pine", createdAt: NOW - 5 * HOUR, body: "Can you call me?" });
    const reply = ev({ kind: "note", actorKind: "staff", organizationId: "o2", organizationName: "Pine", createdAt: NOW - 4 * HOUR, body: "Called back." });
    const needs = eventNeeds([open, answered, reply], NOW);
    expect(needs.map((item) => [item.reason, item.title, item.client])).toEqual([
      ["inquiry", "Website inquiry: Asked about a project on the website (Product).", "Harbor"],
    ]);
  });

  it("counts an auto-reply at the same moment as answered", () => {
    const message = ev({ kind: "client.message", createdAt: NOW - HOUR, body: "Newsletter" });
    const reply = ev({ kind: "agent.reply", actorKind: "agent", createdAt: NOW - HOUR, body: "What do you want?" });
    expect(eventNeeds([message, reply], NOW)).toEqual([]);
  });

  it("lists a failed deploy until a later deploy to the same repo succeeds", () => {
    const repo = { repo: "makemoney2023/renewimplants" };
    const failed = ev({ kind: "deploy", createdAt: NOW - 3 * HOUR, data: repo, body: "Deploy failed in makemoney2023/renewimplants by someone" });
    expect(eventNeeds([failed], NOW).map((item) => item.reason)).toEqual(["deploy"]);
    const fixed = ev({ kind: "deploy", createdAt: NOW - HOUR, data: repo, body: "Deploy succeeded in makemoney2023/renewimplants by someone" });
    expect(eventNeeds([fixed, failed], NOW)).toEqual([]);
  });

  it("keeps needs-you events out of FYI", () => {
    const open = ev({ kind: "project_inquiry", createdAt: NOW - 3 * HOUR, body: "Asked about a project." });
    const needs = eventNeeds([open], NOW);
    expect(fyiRows([open], [], NOW, new Set(needs.map((item) => item.id)))).toEqual([]);
  });
});

describe("wake and review alerts", () => {
  it("makes one wake alert per client with a count and the last time", () => {
    const alerts = wakeNeeds([
      { organizationId: "org-renew", organizationName: "Renew Implants", parentOrganizationId: null, failures: 6, lastAt: NOW - 10 * HOUR, lastError: "Wake returned 500." },
    ]);
    expect(alerts).toEqual([
      expect.objectContaining({
        reason: "wake",
        title: "Agent isn\u2019t waking: 6 failed wakes",
        body: "Last: Wake returned 500.",
        at: NOW - 10 * HOUR,
        client: "Renew Implants",
        tone: "late",
      }),
    ]);
  });

  it("lists cards waiting on Client Services longer than the wait limit", () => {
    const rows = reviewNeeds(
      [
        { taskId: "t1", title: "Quote export", organizationId: "o1", organizationName: "Strong Foam", parentOrganizationId: "liocorr", projectId: "p1", since: NOW - REVIEW_WAIT_MS - MIN },
        { taskId: "t2", title: "Fresh card", organizationId: "o1", organizationName: "Strong Foam", parentOrganizationId: "liocorr", projectId: "p1", since: NOW - HOUR },
      ],
      NOW,
    );
    expect(rows.map((row) => [row.title, row.href])).toEqual([["\u201cQuote export\u201d waiting on Client Services", "/projects/p1"]]);
  });
});

describe("agent work", () => {
  const events = [
    ev({ kind: "client_services.task_review", createdAt: NOW - 10 * MIN, taskId: "t1", taskTitle: "Quote export", body: 'Client Services: review approved: "Quote export".', data: { decision: "approve" } }),
    ev({ kind: "client_services.task_review", createdAt: NOW - 20 * MIN, taskId: "t2", taskTitle: "Site copy", body: 'Client Services: sent back to in progress: "Site copy". Tone it down.', data: { decision: "progress", note: "Tone it down." } }),
    ev({ kind: "client_agent.review_waiting", actorKind: "agent", createdAt: NOW - 30 * MIN, body: 'Awaiting Client Services review: "Quote export".' }),
    ev({ kind: "client_agent.work_filed", actorKind: "agent", createdAt: NOW - 40 * MIN, body: "StrongFoam CRM/ERP filed: Quote export v1" }),
    ev({ kind: "agent.task_stage", actorKind: "agent", createdAt: NOW - 50 * MIN, body: "Moved to Doing." }),
  ];

  it("lists filings and Client Services decisions, newest first", () => {
    expect(agentWork(events).map((row) => [row.decision, row.title])).toEqual([
      ["approved", "Approved \u201cQuote export\u201d"],
      ["sent_back", "Sent back \u201cSite copy\u201d"],
      ["waiting", "Awaiting Client Services review: \u201cQuote export\u201d."],
      ["filed", "StrongFoam CRM/ERP filed: Quote export v1"],
    ]);
    expect(agentWork(events)[1]?.body).toBe("Tone it down.");
  });

  it("keeps agent work out of FYI", () => {
    expect(fyiRows(events.slice(0, 4), [], NOW)).toEqual([]);
  });

  it("counts the strip", () => {
    expect(agentWorkStats(events, 3)).toEqual({ waiting: 3, filed: 1, approved: 1, sentBack: 1 });
  });
});

describe("filters, paging and unread", () => {
  const rows = fyiRows(
    [
      ev({ kind: "note", actorKind: "staff", organizationId: "sf", organizationName: "Strong Foam", parentOrganizationId: "lio", createdAt: NOW - HOUR, body: "Now part of LioCorr." }),
      ev({ kind: "stage_change", actorKind: "staff", organizationId: "lio", organizationName: "LioCorr", createdAt: NOW - 3 * HOUR, body: "Moved from new to won." }),
      ev({ kind: "lead.prospected", actorKind: "agent", organizationId: "pine", organizationName: "Pine", createdAt: NOW - 5 * HOUR, body: "BDR found this prospect." }),
    ],
    [],
    NOW,
  );

  it("filters by a parent group and by type", () => {
    expect(filterFeed(rows, { client: "lio" }).map((row) => row.client)).toEqual(["Strong Foam", "LioCorr"]);
    expect(filterFeed(rows, { client: "sf" }).map((row) => row.client)).toEqual(["Strong Foam"]);
    expect(filterFeed(rows, { type: "leads" }).map((row) => row.client)).toEqual(["LioCorr", "Pine"]);
    expect(filterFeed(rows, { type: "clients", client: "pine" })).toEqual([]);
  });

  it("caps the feed and says how many are left", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ ...rows[0]!, id: `r${index}` }));
    expect(pageRows(many, FEED_PAGE)).toMatchObject({ more: 5 });
    expect(pageRows(many, FEED_PAGE).rows).toHaveLength(25);
    expect(pageRows(many, 50)).toMatchObject({ more: 0 });
  });

  it("counts rows newer than the last visit", () => {
    expect(unreadCount(rows, NOW - 2 * HOUR)).toBe(1);
    expect(unreadCount(rows, null)).toBe(0);
  });

  it("reads the query", () => {
    expect(feedQuery({ type: "agent", client: "lio", limit: "50" })).toEqual({ type: "agent", client: "lio", limit: 50 });
    expect(feedQuery({ type: "nope", limit: "-3" })).toEqual({ type: "all", client: null, limit: FEED_PAGE });
    expect(feedQuery({ feed: "leads" })).toMatchObject({ type: "leads" });
  });
});

describe("clientChoices", () => {
  it("puts a group's companies under the parent", () => {
    expect(
      clientChoices([
        { id: "renew", name: "Renew Implants", parentId: null },
        { id: "sf", name: "Strong Foam", parentId: "lio" },
        { id: "lio", name: "LioCorr Holdings", parentId: null },
        { id: "ev", name: "Everleigh Homes", parentId: "lio" },
      ]),
    ).toEqual([
      { id: "lio", label: "LioCorr Holdings (group)", depth: 0 },
      { id: "ev", label: "Everleigh Homes", depth: 1 },
      { id: "sf", label: "Strong Foam", depth: 1 },
      { id: "renew", label: "Renew Implants", depth: 0 },
    ]);
  });
});
