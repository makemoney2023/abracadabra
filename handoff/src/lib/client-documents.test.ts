import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRIEF_SECTIONS,
  DESIGN_SECTIONS,
  FILE_QUESTIONS,
  chooseSkillsForPiece,
  draftClientDocuments,
  isPublicWebsite,
  pageTokens,
  parseSkillCatalog,
  parseSkillFrontMatter,
  type SkillCard,
} from "@/lib/client-documents";

const SKILLS_ROOT = path.resolve(__dirname, "../../../.cursor/skills");

const REAL_SKILLS = [
  "community/marketingskills/copywriting/SKILL.md",
  "community/inference-sh/competitor-teardown/SKILL.md",
  "community/awesome-claude-corporate-skills/08-it-engineering/frontend-design/SKILL.md",
  "community/inference-sh/landing-page-design/SKILL.md",
  "community/marketingskills/social/SKILL.md",
  "community/ui-ux-pro-max-skill/design-system/SKILL.md",
  "community/text-to-cad/implicit-cad/SKILL.md",
];

function catalogFromDisk(): SkillCard[] {
  return REAL_SKILLS.map((skillPath) => {
    const raw = readFileSync(path.join(SKILLS_ROOT, skillPath), "utf8");
    const front = parseSkillFrontMatter(raw);
    if (!front) throw new Error(`No front matter in ${skillPath}`);
    return { ...front, path: skillPath };
  });
}

type Call = { name: string; args: Record<string, unknown> };

function context(extra: Record<string, unknown> = {}) {
  return {
    organization: {
      id: "org-1",
      name: "Strongfoam",
      website: "https://strongfoam.example",
      industry: "packaging",
      notes: "Ships foam inserts.",
      briefApproval: "client",
      autoPublishBuilt: false,
      agentPausedAt: null,
    },
    assessment: { totalScore: 70, scores: {}, answerSummary: "Ready to launch a site." },
    project: { id: "proj-1", name: "Launch", status: "active", dueAt: null, milestones: [] },
    workspaces: [
      {
        id: "ws-1",
        slug: "strongfoam",
        displayName: "Strongfoam",
        logoObjectKey: "logos/sf.png",
        policyProfile: "standard",
        fileCounts: {},
      },
    ],
    briefs: [{ deliverableId: "brief-1", kind: "brief", status: "draft", version: 1, publishedVersion: null }],
    ...extra,
  };
}

const readyFile = {
  name: "about.txt",
  status: "ready",
  summary: "Strongfoam sells protective foam to electronics makers.",
  relativePath: "about.txt",
  tag: "copy",
};

const failedFile = {
  name: "logo.pdf",
  status: "failed",
  summary: null,
  relativePath: "uploads/logo.pdf",
  tag: "brand",
};

function searchAnswer(query: string, emptyBuyers: boolean) {
  if (emptyBuyers && query === "who buys") return "No files matched.";
  if (query === "what the client sells") {
    return [{ passage: "Strongfoam sells protective foam.", relativePath: "about.txt", tag: "copy", summary: readyFile.summary, status: "ready", fileName: "about.txt" }];
  }
  if (query === "what they asked for") {
    return [{ passage: "They asked for a website.", relativePath: "about.txt", tag: "copy", summary: readyFile.summary, status: "ready", fileName: "about.txt" }];
  }
  return [{ passage: "Existing notes.", relativePath: "about.txt", tag: "copy", summary: readyFile.summary, status: "ready", fileName: "about.txt" }];
}

function caller(options: {
  files: typeof readyFile[];
  emptyBuyers?: boolean;
  paused?: boolean;
  briefs?: unknown[];
  project?: unknown;
}) {
  const calls: Call[] = [];
  const base = context();
  const ctx = {
    ...base,
    organization: { ...base.organization, agentPausedAt: options.paused ? 99 : null },
    briefs: options.briefs ?? base.briefs,
    ...(options.project === undefined ? {} : { project: options.project }),
  };
  const call = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "client_context") return ctx;
    if (name === "list_files") {
      if (args.tag === "brand") return options.files.filter((file) => file.tag === "brand" && file.status === "ready");
      return options.files;
    }
    if (name === "search_files") return searchAnswer(String(args.query), options.emptyBuyers === true);
    if (name === "save_brief") return { deliverableId: "del-1", version: 1, kind: args.kind };
    return { ok: true };
  };
  return { call, calls };
}

describe("skill catalog from .cursor/skills", () => {
  it("reads name and description from a skill file", () => {
    const raw = readFileSync(path.join(SKILLS_ROOT, "community/marketingskills/copywriting/SKILL.md"), "utf8");
    expect(parseSkillFrontMatter(raw)).toMatchObject({ name: "copywriting" });
    expect(parseSkillFrontMatter(raw)?.description.toLowerCase()).toContain("landing");
    expect(parseSkillFrontMatter("no front matter")).toBeNull();
  });

  it("reads a published index", () => {
    const catalog = parseSkillCatalog(
      JSON.stringify({
        skills: [{ name: "copywriting", description: "Landing pages", path: "community/marketingskills/copywriting/SKILL.md" }, { name: "" }],
      }),
    );
    expect(catalog).toEqual([
      { name: "copywriting", description: "Landing pages", path: "community/marketingskills/copywriting/SKILL.md" },
    ]);
    expect(parseSkillCatalog("not json")).toEqual([]);
  });

  it("picks website skills for Cursor and leaves unrelated skills out", () => {
    const catalog = catalogFromDisk();
    const chosen = chooseSkillsForPiece({ kind: "website", outcome: "A website the client can send to buyers." }, catalog);
    const paths = chosen.map((skill) => skill.path);
    expect(paths).toContain("community/marketingskills/copywriting/SKILL.md");
    expect(paths).toContain("community/inference-sh/competitor-teardown/SKILL.md");
    expect(chosen.some((skill) => skill.mode === "plan" && skill.path.includes("frontend-design"))).toBe(true);
    expect(paths).not.toContain("community/text-to-cad/implicit-cad/SKILL.md");
    expect(paths).not.toContain("community/marketingskills/social/SKILL.md");
  });

  it("picks the social skill for a social pack", () => {
    const chosen = chooseSkillsForPiece({ kind: "social_pack", outcome: "Posts for the launch." }, catalogFromDisk());
    expect(chosen.map((skill) => skill.path)).toContain("community/marketingskills/social/SKILL.md");
  });
});

describe("client brief and design system", () => {
  const catalog = () => catalogFromDisk();

  it("saves a brief and a design system, names Cursor skills, and asks staff about gaps", async () => {
    const { call, calls } = caller({ files: [readyFile, failedFile], emptyBuyers: true });
    const result = await draftClientDocuments({
      call,
      reason: "context_changed",
      requestId: "wake-1",
      now: 1_700_000_000_000,
      catalog: catalog(),
      fetchPage: async () => ({ ok: false, text: "" }),
    });
    expect(result.outcome).toBe("asked");
    const saves = calls.filter((entry) => entry.name === "save_brief");
    expect(saves.map((entry) => entry.args.kind).sort()).toEqual(["brief", "design_system"]);
    const brief = String(saves.find((entry) => entry.args.kind === "brief")?.args.bodyMarkdown);
    const design = String(saves.find((entry) => entry.args.kind === "design_system")?.args.bodyMarkdown);
    for (const section of BRIEF_SECTIONS) expect(brief).toContain(`## ${section}`);
    for (const section of DESIGN_SECTIONS) expect(design).toContain(`## ${section}`);
    expect(brief).toContain(".cursor/skills/community/marketingskills/copywriting/SKILL.md");
    expect(brief).toContain("(plan)");
    expect(design).toContain(".cursor/skills/community/ui-ux-pro-max-skill/design-system/SKILL.md");
    expect(Array.isArray(saves[0]?.args.sourcesJson)).toBe(true);
    const questions = calls.filter((entry) => entry.name === "ask_staff").map((entry) => String(entry.args.question));
    expect(questions.some((question) => question.includes("uploads/logo.pdf"))).toBe(true);
    expect(questions.some((question) => question.toLowerCase().includes("who buys"))).toBe(true);
    expect(calls.some((entry) => entry.name === "post_status_update")).toBe(false);
    expect(calls.some((entry) => entry.name === "add_note" && String(entry.args.body).includes("brief-writing"))).toBe(true);
    expect(FILE_QUESTIONS.some((question) => question.query === "who buys" && question.blocking)).toBe(true);
  });

  it("posts an internal update when the brief has no blocking gap", async () => {
    const { call, calls } = caller({ files: [readyFile], emptyBuyers: false, briefs: [] });
    const result = await draftClientDocuments({
      call,
      reason: "onboard",
      requestId: "wake-2",
      now: 1_700_000_000_000,
      catalog: catalog(),
    });
    expect(result.outcome).toBe("drafted");
    const saves = calls.filter((entry) => entry.name === "save_brief");
    expect(saves).toHaveLength(1);
    expect(saves[0]?.args.kind).toBe("brief");
    const status = calls.find((entry) => entry.name === "post_status_update");
    expect(status?.args).toMatchObject({ audience: "internal", health: "on_track", projectId: "proj-1" });
    expect(calls.some((entry) => entry.name === "ask_staff")).toBe(false);
  });

  it("writes nothing when the client is paused", async () => {
    const { call, calls } = caller({ files: [readyFile], paused: true });
    const result = await draftClientDocuments({
      call,
      reason: "onboard",
      requestId: "wake-3",
      now: 1_700_000_000_000,
      catalog: catalog(),
    });
    expect(result.outcome).toBe("paused");
    expect(calls.filter((entry) => entry.name === "save_brief")).toHaveLength(0);
  });

  it("proposes a design system when no brand file exists and caches the website", async () => {
    let fetches = 0;
    const cache = new Map<string, { value: string; expiresAt: number }>();
    const html = "<style>body{color:#112233;font-family:Inter}</style><p>Hello foam</p>";
    const first = caller({ files: [readyFile], briefs: context().briefs });
    await draftClientDocuments({
      call: first.call,
      reason: "brief_approved",
      requestId: "wake-4",
      now: 1_700_000_000_000,
      catalog: catalog(),
      fetchPage: async () => {
        fetches += 1;
        return { ok: true, text: html };
      },
      cache: {
        async get(key) {
          const row = cache.get(key);
          if (!row || row.expiresAt <= 1_700_000_000_000) return null;
          return row.value;
        },
        async set(key, value, expiresAt) {
          cache.set(key, { value, expiresAt });
        },
      },
    });
    const second = caller({ files: [readyFile], briefs: context().briefs });
    await draftClientDocuments({
      call: second.call,
      reason: "brief_approved",
      requestId: "wake-5",
      now: 1_700_000_000_000 + 1000,
      catalog: catalog(),
      fetchPage: async () => {
        fetches += 1;
        return { ok: true, text: html };
      },
      cache: {
        async get(key) {
          const row = cache.get(key);
          if (!row || row.expiresAt <= 1_700_000_000_000 + 1000) return null;
          return row.value;
        },
        async set(key, value, expiresAt) {
          cache.set(key, { value, expiresAt });
        },
      },
    });
    const design = String(first.calls.find((entry) => entry.name === "save_brief")?.args.bodyMarkdown);
    expect(design.toLowerCase()).toContain("proposed");
    expect(design).toContain("#112233");
    expect(design).toContain("Inter");
    expect(fetches).toBe(1);
    expect(second.calls.filter((entry) => entry.name === "save_brief")).toHaveLength(1);
  });

  it("saves only the brief when context changes and none exists yet", async () => {
    const { call, calls } = caller({ files: [readyFile], briefs: [] });
    await draftClientDocuments({
      call,
      reason: "context_changed",
      requestId: "wake-6",
      now: 1_700_000_000_000,
      catalog: catalog(),
    });
    expect(calls.filter((entry) => entry.name === "save_brief").map((entry) => entry.args.kind)).toEqual(["brief"]);
  });

  it("asks staff to name a project and still saves the brief", async () => {
    const { call, calls } = caller({ files: [readyFile], emptyBuyers: false, briefs: [], project: null });
    await draftClientDocuments({
      call,
      reason: "onboard",
      requestId: "wake-7",
      now: 1_700_000_000_000,
      catalog: catalog(),
    });
    expect(calls.some((entry) => entry.name === "save_brief" && entry.args.kind === "brief")).toBe(true);
    expect(calls.some((entry) => entry.name === "ask_staff" && String(entry.args.question).toLowerCase().includes("project"))).toBe(true);
    expect(calls.some((entry) => entry.name === "post_status_update")).toBe(false);
  });

  it("refuses a website that is not public https", () => {
    expect(isPublicWebsite("https://strongfoam.example")).toBe(true);
    expect(isPublicWebsite("http://strongfoam.example")).toBe(false);
    expect(isPublicWebsite("https://localhost/home")).toBe(false);
    expect(isPublicWebsite("https://10.0.0.5/home")).toBe(false);
    const tokens = pageTokens("<style>a{color:#abc;font-family:Georgia}</style><p>Hello</p>");
    expect(tokens.colors).toContain("#abc");
    expect(tokens.fonts).toContain("Georgia");
    expect(tokens.text).toContain("Hello");
  });
});
