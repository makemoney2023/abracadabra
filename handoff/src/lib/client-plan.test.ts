import { describe, expect, it } from "vitest";
import { chooseSkillsForPiece, parseSkillCatalog, type SkillCard } from "@/lib/client-documents";
import { advanceClientWork, applyBriefChange, briefChangeActions, piecesFromBrief, planClientWork, qualifyLead } from "@/lib/client-plan";

const COPY = "community/marketingskills/copywriting/SKILL.md";
const TEARDOWN = "community/inference-sh/competitor-teardown/SKILL.md";
const LANDING = "community/inference-sh/landing-page-design/SKILL.md";
const SOCIAL = "community/marketingskills/social/SKILL.md";

const BRIEF = `## Scope
- website — A website the client can send to buyers.
- social_pack — A week of posts.

## Skills
Cursor reads these files from \`.cursor/skills\` and follows them for each piece.

### website
A website the client can send to buyers.
- \`.cursor/skills/${TEARDOWN}\` (complete)
- \`.cursor/skills/${COPY}\` (complete)
- \`.cursor/skills/${LANDING}\` (plan)

### social_pack
A week of posts.
- \`.cursor/skills/${SOCIAL}\` (complete)
`;

const DESIGN = "## Palette\nBlue and gold.\n";

type Call = { name: string; args: Record<string, unknown> };

function context(tasks: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    organization: { id: "org-1", name: "Foam Co", agentPausedAt: null },
    project: { id: "proj-1", name: "Launch" },
    tasks,
    answeredSince: [],
    ...extra,
  };
}

function caller(options: { tasks?: unknown[]; brief?: string | null; paused?: boolean; answered?: unknown[] }) {
  const calls: Call[] = [];
  let made = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "client_context") {
      return context(options.tasks ?? [], {
        organization: { id: "org-1", name: "Foam Co", agentPausedAt: options.paused ? 1 : null },
        answeredSince: options.answered ?? [],
      });
    }
    if (name === "get_brief") {
      if (options.brief === null) return { body: "" };
      if (args.kind === "design_system") return { body: DESIGN, deliverableId: "del-design" };
      return { body: options.brief ?? BRIEF, deliverableId: "del-brief", title: "Foam brief" };
    }
    if (name === "create_deliverable") {
      made += 1;
      return { deliverableId: `del-${made}`, status: "draft" };
    }
    if (name === "create_task") return { taskId: `task-${String(args.title)}`, stage: args.stage, status: "todo" };
    return { ok: true };
  };
  return { call, calls };
}

describe("lead pickup", () => {
  it("files a qualify task, a note, and a space file", async () => {
    const { call, calls } = caller({});
    const result = await qualifyLead({ call, requestId: "wake-lead" });
    expect(result).toBe("started");
    expect(calls.map((entry) => entry.name)).toEqual([
      "client_context",
      "store_scan_context",
      "add_note",
      "create_task",
      "save_space_file",
      "record_swarm_run",
    ]);
    expect(calls[3]?.args).toMatchObject({ title: "Qualify Foam Co", stage: "describe", skills: [] });
    expect(calls[4]?.args).toMatchObject({ workflow: "lead", run: "wake-lead", node: "qualify" });
    expect(String(calls[4]?.args.body)).toContain("Foam Co");
  });

  it("stores the swarm copy when a run is provided", async () => {
    const { call, calls } = caller({});
    const briefs: string[] = [];
    await qualifyLead({
      call,
      requestId: "wake-lead",
      runSwarm: async (brief) => {
        briefs.push(brief);
        return "Hello Foam Co.";
      },
    });
    expect(briefs[0]).toContain("Lead: Foam Co");
    expect(String(calls.find((entry) => entry.name === "save_space_file")?.args.body)).toContain("Hello Foam Co.");
  });

  it("runs the pack that matches the lead", async () => {
    const templates: string[] = [];
    const recorded: { packId?: string; status?: string }[] = [];
    const call = async (name: string, args: { packId?: string; status?: string } = {}) => {
      if (name === "record_swarm_run") recorded.push(args);
      if (name === "client_context") {
        return { organization: { name: "Foam", notes: "Need an seo audit", agentPausedAt: null } };
      }
      return { ok: true };
    };
    await qualifyLead({
      call,
      requestId: "wake-lead",
      packs: [
        { id: "pack-sales", name: "Sales", description: "Skills: call prep, account research." },
        { id: "pack-seo", name: "Seo", description: "Skills: seo audit, search intent." },
      ],
      runSwarm: async (_brief, templateId) => {
        templates.push(templateId);
        return "Audit done.";
      },
    });
    expect(templates).toEqual(["pack-seo"]);
    expect(recorded[0]).toMatchObject({ packId: "pack-seo", status: "completed" });
  });

  it("asks for another look when the swarm is still running", async () => {
    const seen: { executionId?: string; activityKey?: string; templateId?: string }[] = [];
    const call = async (name: string) => {
      if (name === "client_context") {
        return { organization: { name: "Foam", notes: "Need an seo audit", agentPausedAt: null } };
      }
      return { ok: true, stored: [] };
    };
    await qualifyLead({
      call,
      requestId: "wake-lead",
      packs: [{ id: "pack-seo", name: "Seo", description: "Skills: seo audit, search intent." }],
      runSwarm: async (brief) => {
        expect(brief.includes("Use the schema scan")).toBe(false);
        return { output: "Still writing.", status: "running", executionId: "ex-9" };
      },
      onStillRunning: async (run) => {
        seen.push(run);
      },
    });
    expect(seen).toEqual([
      {
        executionId: "ex-9",
        templateId: "pack-seo",
        activityKey: "wake-lead:swarm-run",
        packName: "Seo",
        trigger: "lead_created",
      },
    ]);
  });

  it("stops when the agent is paused", async () => {
    const { call, calls } = caller({ paused: true });
    expect(await qualifyLead({ call, requestId: "wake-lead" })).toBe("skipped");
    expect(calls.map((entry) => entry.name)).toEqual(["client_context"]);
  });
});

describe("brief planning", () => {
  it("reads the skill paths already written on the brief", () => {
    const pieces = piecesFromBrief(BRIEF);
    expect(pieces.map((piece) => piece.kind)).toEqual(["website", "social_pack"]);
    expect(pieces[0]?.stage).toBe("describe");
    expect(pieces[0]?.skills.map((skill) => `${skill.path}:${skill.mode}`)).toEqual([
      `${TEARDOWN}:complete`,
      `${COPY}:complete`,
      `${LANDING}:plan`,
    ]);
    expect(pieces[1]?.stage).toBe("engineer");
    expect(pieces[1]?.skills).toEqual([{ path: SOCIAL, mode: "complete", status: "todo" }]);
  });

  it("falls back to the catalog when the brief has no skill list", () => {
    const catalog: SkillCard[] = parseSkillCatalog(
      JSON.stringify({
        skills: [{ name: "copywriting", description: "Landing page copy for a website.", path: COPY }],
      }),
    );
    const pieces = piecesFromBrief("## Scope\n- website — A website the client can send to buyers.\n", catalog);
    expect(pieces[0]?.skills.map((skill) => skill.path)).toEqual(
      chooseSkillsForPiece({ kind: "website", outcome: "A website the client can send to buyers." }, catalog).map(
        (skill) => skill.path,
      ),
    );
  });

  it("creates one task and one draft per piece", async () => {
    const { call, calls } = caller({});
    const result = await planClientWork({ call, requestId: "wake-1", now: 1_700_000_000_000 });
    expect(result).toBe("planned");
    const tasks = calls.filter((entry) => entry.name === "create_task");
    const drafts = calls.filter((entry) => entry.name === "create_deliverable");
    expect(tasks).toHaveLength(2);
    expect(drafts).toHaveLength(2);
    expect(tasks[0]?.args).toMatchObject({
      title: "website: A website the client can send to buyers.",
      stage: "describe",
      projectId: "proj-1",
      deliverableId: "del-1",
    });
    expect(tasks[0]?.args.skills).toEqual([
      { path: TEARDOWN, mode: "complete", status: "todo" },
      { path: COPY, mode: "complete", status: "todo" },
      { path: LANDING, mode: "plan", status: "todo" },
    ]);
    expect(tasks[1]?.args).toMatchObject({ stage: "engineer", deliverableId: "del-2" });
    expect(tasks[1]?.args.kind).toBeUndefined();
    expect(drafts.map((entry) => entry.args.kind)).toEqual(["website", "social_pack"]);
    const status = calls.find((entry) => entry.name === "post_status_update");
    expect(status?.args).toMatchObject({ audience: "internal", projectId: "proj-1" });
    expect(String(status?.args.body)).toContain("Planned");
    expect(String(status?.args.body)).toContain("Foam Co");
    const note = calls.find((entry) => entry.name === "add_note");
    expect(note?.args.kind).toBe("plan");
    expect(calls.filter((entry) => entry.name === "create_task").every((entry) => String(entry.args.requestId).startsWith("wake-1"))).toBe(
      true,
    );
  });

  it("does not plan a second copy when the tasks already exist", async () => {
    const { call, calls } = caller({
      tasks: [{ id: "task-web", title: "website: A website the client can send to buyers.", status: "todo", stage: "describe", skills: [] }],
    });
    await planClientWork({ call, requestId: "wake-2", now: 1 });
    const titles = calls.filter((entry) => entry.name === "create_task").map((entry) => entry.args.title);
    expect(titles).toEqual(["social_pack: A week of posts."]);
  });

  it("skips a paused client", async () => {
    const { call, calls } = caller({ paused: true });
    expect(await planClientWork({ call, requestId: "wake-3", now: 1 })).toBe("skipped");
    expect(calls.some((entry) => entry.name === "create_task")).toBe(false);
  });
});

describe("one skill step per wake", () => {
  const websiteTask = {
    id: "task-web",
    title: "website: A website the client can send to buyers.",
    status: "todo",
    stage: "describe",
    round: 1,
    deliverableId: "del-web",
    skills: [
      { path: TEARDOWN, mode: "complete", status: "todo" },
      { path: COPY, mode: "complete", status: "todo" },
      { path: LANDING, mode: "plan", status: "todo" },
    ],
  };

  it("finishes one complete step and leaves the next untouched", async () => {
    const seen: string[] = [];
    const { call, calls } = caller({ tasks: [websiteTask] });
    const result = await advanceClientWork({
      call,
      requestId: "wake-4",
      now: 1,
      readSkill: async (skillPath) => {
        seen.push(skillPath);
        return "---\nname: competitor-teardown\n---\nLook at rivals.";
      },
    });
    expect(result).toEqual({ advanced: 1, reschedule: true });
    expect(seen).toEqual([TEARDOWN]);
    const update = calls.find((entry) => entry.name === "update_task");
    expect(update?.args.skills).toEqual([
      { path: TEARDOWN, mode: "complete", status: "done" },
      { path: COPY, mode: "complete", status: "todo" },
      { path: LANDING, mode: "plan", status: "todo" },
    ]);
    expect(update?.args.status).toBe("doing");
    const item = calls.find((entry) => entry.name === "add_deliverable_item");
    expect(item?.args).toMatchObject({ deliverableId: "del-web" });
    expect(String(item?.args.bodyMarkdown).length).toBeGreaterThan(0);
    expect(String(item?.args.bodyMarkdown)).not.toContain("Look at rivals.");
    expect(calls.some((entry) => entry.name === "ask_staff")).toBe(false);
  });

  it("writes the build brief and moves the task to build when the next step is plan", async () => {
    const planned = {
      ...websiteTask,
      skills: [
        { path: TEARDOWN, mode: "complete", status: "done" },
        { path: COPY, mode: "complete", status: "done" },
        { path: LANDING, mode: "plan", status: "todo" },
      ],
    };
    const { call, calls } = caller({ tasks: [planned] });
    const result = await advanceClientWork({
      call,
      requestId: "wake-5",
      now: 1,
      readSkill: async () => {
        throw new Error("a plan step does not load the skill");
      },
    });
    expect(result.reschedule).toBe(false);
    const item = calls.find((entry) => entry.name === "add_deliverable_item");
    expect(item?.args.path).toBe("build-brief.md");
    const body = String(item?.args.bodyMarkdown);
    expect(body).toContain("del-web");
    expect(body).toContain("website");
    expect(body).toContain("Blue and gold.");
    expect(body).toContain("handoff/del-web/r1");
    expect(body).toContain("deliverables/website/manifest.json");
    expect(body).toContain("Deliverable del-web round 1");
    expect(body).toContain("Deliverable: del-web");
    expect(body.toLowerCase()).toContain("force push");
    const update = calls.find((entry) => entry.name === "update_task");
    expect(update?.args.stage).toBe("build");
    expect(calls.some((entry) => /cursor|publish|repo/i.test(entry.name))).toBe(false);
  });

  it("marks a finished complete-only task done and leaves the deliverable unpublished", async () => {
    const social = {
      id: "task-social",
      title: "social_pack: A week of posts.",
      status: "doing",
      stage: "engineer",
      round: 1,
      deliverableId: "del-social",
      skills: [{ path: SOCIAL, mode: "complete", status: "todo" }],
    };
    const { call, calls } = caller({ tasks: [social] });
    const result = await advanceClientWork({
      call,
      requestId: "wake-6",
      now: 1,
      readSkill: async () => "---\nname: social\n---\nWrite the posts.",
    });
    expect(result).toEqual({ advanced: 1, reschedule: false });
    const update = calls.find((entry) => entry.name === "update_task");
    expect(update?.args).toMatchObject({ taskId: "task-social", status: "done", stage: "run" });
    expect(calls.some((entry) => entry.name === "add_deliverable_item")).toBe(true);
    expect(calls.some((entry) => /publish/i.test(entry.name))).toBe(false);
  });

  it("asks staff when the skill file is missing and does not invent the work", async () => {
    const social = {
      id: "task-social",
      title: "social_pack: A week of posts.",
      status: "todo",
      stage: "engineer",
      deliverableId: "del-social",
      skills: [{ path: SOCIAL, mode: "complete", status: "todo" }],
    };
    const { call, calls } = caller({ tasks: [social] });
    await advanceClientWork({
      call,
      requestId: "wake-7",
      now: 1,
      readSkill: async () => null,
    });
    const question = calls.find((entry) => entry.name === "ask_staff");
    expect(question?.args.taskId).toBe("task-social");
    expect(String(question?.args.question)).toContain(SOCIAL);
    expect(calls.some((entry) => entry.name === "add_deliverable_item")).toBe(false);
    expect(calls.some((entry) => entry.name === "update_task" && entry.args.status === "done")).toBe(false);
  });

  it("stops after eight steps and asks for another wake", async () => {
    const tasks = Array.from({ length: 9 }, (_, index) => ({
      id: `task-${index}`,
      title: `Piece ${index}`,
      status: "todo",
      stage: "engineer",
      deliverableId: `del-${index}`,
      skills: [{ path: COPY, mode: "complete", status: "todo" }],
    }));
    const { call, calls } = caller({ tasks });
    const result = await advanceClientWork({
      call,
      requestId: "wake-8",
      now: 1,
      readSkill: async () => "---\nname: copywriting\n---\nWrite.",
    });
    expect(result).toEqual({ advanced: 8, reschedule: true });
    const updated = calls.filter((entry) => entry.name === "update_task").map((entry) => entry.args.taskId);
    expect(updated).toHaveLength(8);
    expect(updated).not.toContain("task-8");
  });
});

describe("brief changes", () => {
  const skill = { path: COPY, mode: "complete" as const, status: "todo" as const };
  const other = { path: SOCIAL, mode: "complete" as const, status: "todo" as const };

  it("creates a new piece and leaves an unchanged piece alone", () => {
    const actions = briefChangeActions(BRIEF, `${BRIEF}- extra — Another page.\n`, [
      { id: "web", title: "website: A website the client can send to buyers.", status: "todo", stage: "describe", skills: [skill] },
    ]);
    expect(actions.some((action) => action.type === "create")).toBe(true);
    expect(actions.some((action) => action.type === "reset" && action.taskId === "web")).toBe(false);
  });

  it("resets skills still in describe and asks once a piece is in build", () => {
    const next = BRIEF.replace(COPY, SOCIAL);
    const reset = briefChangeActions(BRIEF, next, [
      { id: "web", title: "website: A website the client can send to buyers.", status: "todo", stage: "describe", skills: [skill] },
    ]);
    expect(reset).toContainEqual({ type: "reset", taskId: "web", skills: expect.any(Array), note: "The brief changed this piece. Skills were reset." });
    const asked = briefChangeActions(BRIEF, next, [
      { id: "web", title: "website: A website the client can send to buyers.", status: "doing", stage: "build", skills: [skill] },
    ]);
    expect(asked[0]).toMatchObject({ type: "ask", taskId: "web" });
  });

  it("blocks a removed piece that is not done and keeps a finished one", () => {
    const next = BRIEF.replace("- social_pack — A week of posts.\n", "");
    const open = briefChangeActions(BRIEF, next, [
      { id: "social", title: "social_pack: A week of posts.", status: "todo", stage: "engineer", skills: [other] },
    ]);
    expect(open).toContainEqual({ type: "block", taskId: "social" });
    const done = briefChangeActions(BRIEF, next, [
      { id: "social", title: "social_pack: A week of posts.", status: "done", stage: "run", skills: [other] },
    ]);
    expect(done.some((action) => action.type === "block")).toBe(false);
    const already = briefChangeActions(BRIEF, next, [
      { id: "social", title: "social_pack: A week of posts.", status: "blocked", stage: "engineer", skills: [other] },
    ]);
    expect(already.some((action) => action.type === "block")).toBe(false);
  });

  function changed(options: { paused?: boolean } = {}) {
    const calls: Call[] = [];
    const call = async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "client_context") {
        return context(
          [
            { id: "web", title: "website: A website the client can send to buyers.", status: "todo", stage: "describe", skills: [skill] },
            { id: "social", title: "social_pack: A week of posts.", status: "todo", stage: "engineer", skills: [other] },
          ],
          { organization: { id: "org-1", name: "Foam Co", agentPausedAt: options.paused ? 1 : null } },
        );
      }
      if (name === "get_brief") {
        return { body: `${BRIEF.replace("## Skills", "- page — A pricing page.\n\n## Skills")}`, previousBody: BRIEF };
      }
      if (name === "create_deliverable") return { deliverableId: "del-new" };
      return { ok: true };
    };
    return { call, calls };
  }

  it("plans a new piece the way the first plan does", async () => {
    const { call, calls } = changed();
    const counts = await applyBriefChange({ call, requestId: "wake-1", now: 1, catalog: [] });
    expect(counts.created).toBe(1);
    const draft = calls.find((entry) => entry.name === "create_deliverable");
    expect(draft?.args).toMatchObject({ title: "page: A pricing page.", projectId: "proj-1" });
    const task = calls.find((entry) => entry.name === "create_task");
    expect(task?.args).toMatchObject({ title: "page: A pricing page.", projectId: "proj-1", deliverableId: "del-new" });
  });

  it("does nothing for a paused client", async () => {
    const { call, calls } = changed({ paused: true });
    await applyBriefChange({ call, requestId: "wake-2", now: 1, catalog: [] });
    expect(calls.map((entry) => entry.name)).toEqual(["client_context"]);
  });
});
