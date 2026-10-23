/**
 * Space smoke test. Builds the app the way production does (`next build`, which OpenNext runs for Workers Builds),
 * starts it with `next start` on a seeded local SQLite file, and requests the staff Space pages. It fails on any
 * non-200, on a missing page marker, and on an error in the server log.
 *
 * Why it exists: PR #206 shipped a server page that called a function exported from a "use client" file. Next throws
 * at render time ("Attempted to call showRetired() from the server..."), the response was still HTTP 200 with an error
 * boundary, and unit tests cannot see the client/server boundary. Only a real build plus a real render catches it.
 *
 * Run: `npm run smoke:spaces` (build + start + check), or `npm run smoke:spaces -- --skip-build` to reuse `.next`.
 * Needs Node 22+, no Cloudflare account, no secrets. Uses a throwaway database under the OS temp dir.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { openPreviewSession } from "@/lib/preview-session";

const HQ_HOST = "hq.localhost";
const NEXT_BIN = require.resolve("next/dist/bin/next");
const APP_DIR = path.resolve(__dirname, "..");
const BAD_LOG = [/Attempted to call/i, /⨯/, /unhandledRejection/i, /Unhandled/i, /\bTypeError\b/, /\bReferenceError\b/, /Error: /];

type Check = { name: string; path: string; mustInclude: string[]; mustNotInclude?: string[] };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function get(port: number, urlPath: string, token: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path: urlPath, method: "GET", headers: { host: `${HQ_HOST}:${port}`, cookie: `handoff_session=${token}` } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    request.setTimeout(120_000, () => request.destroy(new Error(`timeout on ${urlPath}`)));
    request.on("error", reject);
    request.end();
  });
}

/** A staff session plus two Spaces: one whose project stays out of the Library, one that is in it. */
async function seed(dbPath: string): Promise<string> {
  const db = new DatabaseSync(dbPath);
  const sql = sqliteSql(db);
  await migrate(sql);
  const now = Date.now();
  const session = await openPreviewSession({ sql, now });
  const user = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string };
  db.prepare("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('smoke-org', 'Smoke Client', 'client', ?, ?)").run(now, now);
  const projects = [
    { id: "smoke-p-off", name: "Smoke print job", include: 0, slug: session.slug, prefix: "off" },
    { id: "smoke-p-on", name: "Smoke social project", include: 1, slug: "smoke-on", prefix: "on" },
  ];
  for (const project of projects) {
    db.prepare("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at, include_in_library) VALUES (?, 'smoke-org', ?, 'active', ?, ?, ?)").run(project.id, project.name, now, now, project.include);
    if (project.slug !== session.slug) {
      db.prepare("INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at) VALUES (?, ?, ?, ?, 'Smoke', 'standard', 1000000, 30, 0, 'active', ?)").run(`ws-${project.prefix}`, project.slug, project.slug, project.name, now);
    }
    const workspace = db.prepare("SELECT id FROM workspaces WHERE slug = ?").get(project.slug) as { id: string };
    db.prepare("UPDATE workspaces SET organization_id = 'smoke-org', project_id = ? WHERE id = ?").run(project.id, workspace.id);
    for (const [kind, hidden, file] of [["live", null, `${project.prefix}-live.png`], ["retired", now, `${project.prefix}-retired.png`]] as const) {
      const batch = `smoke-b-${project.prefix}-${kind}`;
      db.prepare("INSERT INTO batches (id, workspace_id, created_by, label, created_at, last_activity_at, hidden_at, held_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(batch, workspace.id, user.id, batch, now, now, hidden, now);
      db.prepare("INSERT INTO files (id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, created_at) VALUES (?, ?, ?, ?, 'png', 100, ?, 'other', 'clean', ?)").run(`smoke-f-${project.prefix}-${kind}`, batch, workspace.id, file, `smoke-key-${project.prefix}-${kind}`, now);
    }
  }
  db.close();
  return session.sessionToken;
}

function checks(offSlug: string): Check[] {
  return [
    { name: "Space home (project out of the Library)", path: `/w/${offSlug}`, mustInclude: ["off-live.png", "Show retired (1)"], mustNotInclude: ["off-retired.png"] },
    { name: "Space home with ?retired=1", path: `/w/${offSlug}?retired=1`, mustInclude: ["off-live.png", "off-retired.png", "Show retired (1)"] },
    { name: "Space home (project in the Library)", path: "/w/smoke-on", mustInclude: ["on-live.png", "Show retired (1)"], mustNotInclude: ["on-retired.png"] },
    { name: "Library source files", path: `/w/${offSlug}/library?type=file`, mustInclude: ["off-live.png", "Show retired (1)", "stay out of the Library"], mustNotInclude: ["off-retired.png"] },
    { name: "Library source files with ?retired=1", path: `/w/${offSlug}/library?type=file&retired=1`, mustInclude: ["off-live.png", "off-retired.png"] },
    { name: "Library (project in the Library)", path: "/w/smoke-on/library", mustInclude: ["The Library is finished work"], mustNotInclude: ["stay out of the Library"] },
    { name: "Project page", path: "/projects/smoke-p-off", mustInclude: ["Smoke print job", "Save Library option"] },
    { name: "Project page (in the Library)", path: "/projects/smoke-p-on", mustInclude: ["Smoke social project", "Save Library option"] },
  ];
}

async function main(): Promise<void> {
  const skipBuild = process.argv.includes("--skip-build");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "handoff-smoke-"));
  const dbPath = path.join(tmp, "handoff.db");
  const env = { ...process.env, HANDOFF_SQLITE_PATH: dbPath, HANDOFF_HQ_HOST: HQ_HOST, HANDOFF_SMOKE_NO_CLOUDFLARE: "1", NEXT_TELEMETRY_DISABLED: "1" };
  let server: ChildProcess | null = null;
  const log: string[] = [];
  const failures: string[] = [];
  try {
    if (!skipBuild) {
      console.log("smoke: next build (the production build)");
      const build = spawnSync(process.execPath, [NEXT_BIN, "build"], { cwd: APP_DIR, env, stdio: "inherit" });
      if (build.status !== 0) throw new Error(`next build failed (exit ${build.status})`);
    }
    process.env.HANDOFF_SQLITE_PATH = dbPath;
    const token = await seed(dbPath);
    const port = await freePort();
    // Run next directly (not through npx) so killing this child really stops the server.
    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: APP_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", (chunk) => log.push(String(chunk)));
    server.stderr?.on("data", (chunk) => log.push(String(chunk)));
    const started = Date.now();
    while (!log.join("").includes("Ready in")) {
      if (server.exitCode !== null) throw new Error(`next start exited early:\n${log.join("")}`);
      if (Date.now() - started > 90_000) throw new Error(`next start did not become ready:\n${log.join("")}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const offSlug = (await (async () => {
      const db = new DatabaseSync(dbPath);
      const row = db.prepare("SELECT slug FROM workspaces WHERE project_id = 'smoke-p-off'").get() as { slug: string };
      db.close();
      return row.slug;
    })());
    for (const check of checks(offSlug)) {
      const { status, body } = await get(port, check.path, token);
      const problems: string[] = [];
      if (status !== 200) problems.push(`status ${status}`);
      for (const text of check.mustInclude) if (!body.includes(text)) problems.push(`missing "${text}"`);
      for (const text of check.mustNotInclude ?? []) if (body.includes(text)) problems.push(`should not contain "${text}"`);
      console.log(`${problems.length ? "FAIL" : "ok  "} ${check.name} ${check.path}${problems.length ? ` -> ${problems.join("; ")}` : ""}`);
      if (problems.length) failures.push(`${check.name}: ${problems.join("; ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    const output = log.join("").replace(/\u001b\[[0-9;]*m/g, "");
    const bad = output.split("\n").filter((line) => BAD_LOG.some((pattern) => pattern.test(line)));
    if (bad.length) failures.push(`server log has errors:\n  ${bad.slice(0, 8).join("\n  ")}`);
  } finally {
    server?.kill("SIGKILL");
    rmSync(tmp, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error(`\nsmoke:spaces FAILED\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nsmoke:spaces passed");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
