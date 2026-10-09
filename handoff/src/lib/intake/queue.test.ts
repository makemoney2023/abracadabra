import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like } from "@/db/sql";
import { localObjectStore } from "@/lib/store/objects";
import { handleLeadIntakeBatch } from "./queue";

const NOW = 1_700_000_000_000;

function database(): D1Like {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return {
    prepare(statement: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all<T>() {
              return { results: db.prepare(statement).all(...params) as T[] };
            },
            async first<T>() {
              const row = db.prepare(statement).get(...params);
              return (row ?? null) as T | null;
            },
            async run() {
              db.prepare(statement).run(...params);
            },
            statement,
            params,
          };
        },
      };
    },
    async exec(statement: string) {
      db.exec(statement);
    },
    async batch(statements) {
      for (const entry of statements) {
        db.prepare(entry.statement ?? "").run(...(entry.params ?? []));
      }
    },
  };
}

const assessment = {
  source: "assessment",
  payload: {
    assessment_id: "asm-wake",
    email: "ada@northwind.example",
    name: "Ada North",
    domain: "northwind.example",
    total_score: 42,
    completed_at: NOW,
  },
};

describe("lead intake wake", () => {
  it("wakes the agent when the assessment opens a lead", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("ok", { status: 200 });
    };
    const message = { body: assessment, ack() {}, retry() {} };
    await handleLeadIntakeBatch(
      [message],
      database(),
      NOW,
      { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      fetchImpl as typeof fetch,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://agent.example/wake");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ reason: "lead_created", sentAt: NOW });
  });

  it("queues a schema scan and waits when an assessment has a website", async () => {
    const db = database();
    await db.exec(
      `CREATE TABLE readiness_scans (
        id TEXT PRIMARY KEY,
        public_token TEXT UNIQUE,
        domain TEXT,
        origin TEXT,
        source TEXT,
        status TEXT,
        organization_id TEXT,
        error_message TEXT,
        created_at INTEGER,
        completed_at INTEGER
      )`,
    );
    const calls: string[] = [];
    const sent: { type: string; scanId: string }[] = [];
    const fetchImpl = async () => {
      calls.push("wake");
      return new Response("ok", { status: 200 });
    };
    await handleLeadIntakeBatch(
      [{ body: assessment, ack() {}, retry() {} }],
      db,
      NOW,
      {
        AGENT_URL: "https://agent.example",
        AGENT_WAKE_SECRET: "wake-secret",
        SCAN_JOBS: {
          async send(body) {
            sent.push(body);
          },
        },
      },
      fetchImpl as typeof fetch,
    );
    expect(calls).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("scan");
  });

  it("does not wake when the same assessment arrives again", async () => {
    const db = database();
    let wakes = 0;
    const fetchImpl = async () => {
      wakes += 1;
      return new Response("ok", { status: 200 });
    };
    const env = { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" };
    const first = { body: assessment, ack() {}, retry() {} };
    const second = { body: assessment, ack() {}, retry() {} };
    await handleLeadIntakeBatch([first], db, NOW, env, fetchImpl as typeof fetch);
    await handleLeadIntakeBatch([second], db, NOW + 1, env, fetchImpl as typeof fetch);
    expect(wakes).toBe(1);
  });

  it("wakes scan_ready without opening another lead", async () => {
    const calls: string[] = [];
    const db = database();
    const message = { body: { source: "scan_ready", organizationId: "org-1", scanId: "scan-1", status: "complete" }, ack() {}, retry() {} };
    await handleLeadIntakeBatch(
      [message],
      db,
      NOW,
      { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      (async (_url, init) => {
        calls.push(String(JSON.parse(String(init?.body ?? "{}")).reason));
        return new Response("ok");
      }) as typeof fetch,
    );
    expect(calls).toEqual(["scan_ready"]);
    const orgs = await db.prepare("SELECT id FROM organizations").bind().all<{ id: string }>();
    expect(orgs.results).toEqual([]);
  });

  it("records a missed wake when the secret is missing", async () => {
    const db = database();
    await migrate(d1Sql(db));
    await db
      .prepare(`INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Foam', 'lead', ?, ?)`)
      .bind(NOW, NOW)
      .run();
    let fetched = false;
    const message = { acked: false, retried: false, body: { source: "scan_ready", organizationId: "org-1" }, ack() { this.acked = true; }, retry() { this.retried = true; } };
    await handleLeadIntakeBatch([message], db, NOW, { AGENT_URL: "https://agent.example" }, (async () => {
      fetched = true;
      return new Response("ok");
    }) as typeof fetch);
    expect(fetched).toBe(false);
    expect(message.acked).toBe(true);
    const rows = await db.prepare("SELECT kind FROM activities WHERE kind = 'agent.wake_failed'").bind().all<{ kind: string }>();
    expect(rows.results).toEqual([{ kind: "agent.wake_failed" }]);
  });

  it("retries when the wake request throws", async () => {
    const message = {
      acked: false,
      retried: false,
      body: { source: "scan_ready", organizationId: "org-1" },
      ack() { this.acked = true; },
      retry() { this.retried = true; },
    };
    await handleLeadIntakeBatch(
      [message],
      database(),
      NOW,
      { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
      (async () => {
        throw new Error("network");
      }) as typeof fetch,
    );
    expect(message.acked).toBe(false);
    expect(message.retried).toBe(true);
  });

  it("files the scraped pages into the space when the scan is ready, even if the agent does not wake", async () => {
    const db = database();
    await migrate(d1Sql(db));
    await db.exec(`
      CREATE TABLE readiness_scans (
        id TEXT PRIMARY KEY,
        domain TEXT,
        status TEXT NOT NULL,
        organization_id TEXT,
        score_total INTEGER,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE readiness_scan_pages (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        url TEXT NOT NULL,
        page_type TEXT NOT NULL,
        schema_types_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL
      );
    `);
    await db
      .prepare(
        `INSERT INTO organizations (id, name, kind, website, domain, created_at, updated_at)
         VALUES ('org-1', 'AbraCadabra', 'client', 'https://abra-ca-dabra.app', 'abra-ca-dabra.app', ?, ?)`,
      )
      .bind(NOW, NOW)
      .run();
    await db
      .prepare(
        `INSERT INTO readiness_scans (id, domain, status, organization_id, score_total, created_at, completed_at)
         VALUES ('scan-abra', 'abra-ca-dabra.app', 'complete', 'org-1', 81, ?, ?)`,
      )
      .bind(NOW, NOW)
      .run();
    await db
      .prepare(
        `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, schema_types_json, evidence_json)
         VALUES ('page-home', 'scan-abra', 'https://abra-ca-dabra.app/', 'home', '["Organization"]', ?)`,
      )
      .bind(JSON.stringify({ businessName: "Abracadabra", scrapedText: "Bespoke software for the work a team already does." }))
      .run();
    const root = mkdtempSync(path.join(tmpdir(), "scan-intake-"));
    const message = {
      acked: false,
      retried: false,
      body: { source: "scan_ready", organizationId: "org-1", scanId: "scan-abra", status: "complete" },
      ack() {
        this.acked = true;
      },
      retry() {
        this.retried = true;
      },
    };
    try {
      await handleLeadIntakeBatch(
        [message],
        db,
        NOW,
        { AGENT_URL: "https://agent.example" },
        (async () => new Response("no", { status: 401 })) as typeof fetch,
        localObjectStore(root),
      );
      expect(message.acked).toBe(true);
      expect(message.retried).toBe(false);
      const file = await db
        .prepare("SELECT relative_path, tag FROM files")
        .bind()
        .first<{ relative_path: string; tag: string }>();
      expect(file?.tag).toBe("reference");
      expect(file?.relative_path).toContain("agent/schema/scan-abra/");
      const passage = await db.prepare("SELECT body FROM file_passages").bind().first<{ body: string }>();
      expect(passage?.body).toContain("Bespoke software");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
