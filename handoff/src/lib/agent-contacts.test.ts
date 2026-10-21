import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { createContact, formatContactAddress, listContacts } from "@/db/crm";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { GET, PATCH, POST } from "@/app/api/agent-contacts/route";
import { agentForToken, registerClientAgent } from "./agent-work-filing";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const staffCaller: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const URL_BASE = "https://hq.example.test/api/agent-contacts";
let sql: Sql;
let d1: D1Like;
function d1Over(db: DatabaseSync): D1Like {
  const prepare = (statement: string) => ({
    bind: (...params: unknown[]) => {
      const stmt = db.prepare(statement);
      const args = params as never[];
      return {
        run: async () => stmt.run(...args),
        all: async <T>() => ({ results: stmt.all(...args) as T[] }),
        first: async <T>() => (stmt.get(...args) as T | undefined) ?? null,
        stmt,
        args,
      };
    },
  });
  return {
    prepare,
    exec: async (statement: string) => db.exec(statement),
    batch: async (statements: unknown[]) => {
      db.exec("BEGIN");
      try {
        for (const entry of statements as { stmt: { run: (...a: never[]) => unknown }; args: never[] }[]) entry.stmt.run(...entry.args);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Like;
}

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)", [NOW]);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  process.env.AGENT_MODE = "agents";
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
});

async function org(name: string, domain: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, name, domain, NOW, NOW]);
  return id;
}

async function agent(organizationId: string, agentId: string, role: "lead" | "hire") {
  const made = await registerClientAgent(sql, { agentId, label: agentId, organizationId, role, actor: "test", now: NOW });
  if (!made.ok) throw new Error("register failed");
  const token = made.token as string;
  if (!(await agentForToken(sql, `Bearer ${token}`))) throw new Error("token failed");
  return token;
}

async function setup() {
  const acme = await org("Acme", "acme.example");
  const lead = await agent(acme, "acme-lead", "lead");
  const hire = await agent(acme, "acme-writer", "hire");
  const other = await org("Other", "other.example");
  const otherLead = await agent(other, "other-lead", "lead");
  const staffMade = await createContact(sql, staffCaller, { organizationId: acme, name: "Dana Staff", email: "dana@acme.example", primary: true }, NOW);
  if (!staffMade.ok) throw new Error("contact failed");
  const foreign = await createContact(sql, staffCaller, { organizationId: other, name: "Olive Other", email: "olive@other.example" }, NOW);
  if (!foreign.ok) throw new Error("contact failed");
  return { acme, other, lead, hire, otherLead, dana: staffMade.value.id, olive: foreign.value.id };
}

function call(method: string, token: string | null, body?: unknown, query = "") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const request = new Request(`${URL_BASE}${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return method === "GET" ? GET(request) : method === "POST" ? POST(request) : PATCH(request);
}

const ADDRESS = { line1: "100 King St W", line2: "Suite 5", city: "Toronto", region: "ON", postal_code: "M5X 1A9", country: "Canada" };

describe("migration 0036", () => {
  it("adds the six address columns and a re-run is a no-op", async () => {
    const names = (await sql.all<{ name: string }>("PRAGMA table_info(contacts)")).map((column) => column.name);
    for (const name of ["address_line1", "address_line2", "city", "region", "postal_code", "country"]) expect(names.filter((n) => n === name)).toHaveLength(1);
    await migrate(sql);
    const again = (await sql.all<{ name: string }>("PRAGMA table_info(contacts)")).map((column) => column.name);
    expect(again.filter((n) => n === "country")).toHaveLength(1);
  });
});

describe("staff contacts with an address", () => {
  it("stores trimmed parts, blanks as NULL, and formats one line", async () => {
    const acme = await org("Acme", "acme.example");
    const made = await createContact(sql, staffCaller, {
      organizationId: acme, name: "Sam", address: { line1: " 1 Main St ", line2: "", city: "Ottawa", region: "ON", postalCode: "K1A 0B1", country: "" },
    }, NOW);
    expect(made.ok).toBe(true);
    const [row] = await listContacts(sql, staffCaller, acme);
    expect(row).toMatchObject({ address_line1: "1 Main St", address_line2: null, city: "Ottawa", country: null });
    expect(formatContactAddress(row)).toBe("1 Main St, Ottawa, ON K1A 0B1");
  });

  it("rejects an address part over its limit", async () => {
    const acme = await org("Acme", "acme.example");
    const made = await createContact(sql, staffCaller, { organizationId: acme, name: "Sam", address: { postalCode: "x".repeat(21) } }, NOW);
    expect(made).toEqual({ ok: false, error: "invalid" });
  });
});

describe("GET /api/agent-contacts", () => {
  it("401 without a token", async () => {
    expect((await call("GET", null)).status).toBe(401);
  });

  it("a lead and a hire read their client's contacts with read-only opt flags", async () => {
    const { lead, hire, dana } = await setup();
    for (const token of [lead, hire]) {
      const response = await call("GET", token);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { contacts: { id: string; primary: boolean; opted_in: boolean; opted_out: boolean; address: { text: string | null } }[] };
      expect(body.contacts).toEqual([expect.objectContaining({ id: dana, primary: true, opted_in: false, opted_out: false, address: expect.objectContaining({ text: null }) })]);
    }
  });

  it("another client's slug is a 403", async () => {
    const { lead } = await setup();
    expect((await call("GET", lead, undefined, "?client=other.example")).status).toBe(403);
  });
});

describe("POST /api/agent-contacts", () => {
  it("the lead adds a contact with an address; activity is logged with actor_kind agent", async () => {
    const { lead, acme } = await setup();
    const response = await call("POST", lead, { name: "Pat Front Desk", email: "Pat@Acme.example", title: "Office manager", address: ADDRESS });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { contact: { id: string; email: string; address: { text: string } } };
    expect(body.contact.email).toBe("pat@acme.example");
    expect(body.contact.address.text).toBe("100 King St W, Suite 5, Toronto, ON M5X 1A9, Canada");
    const activity = await sql.get<{ actor_kind: string; actor_id: string; organization_id: string; body: string }>(
      "SELECT actor_kind, actor_id, organization_id, body FROM activities WHERE contact_id = ?",
      [body.contact.id],
    );
    expect(activity).toEqual({ actor_kind: "agent", actor_id: "acme-lead", organization_id: acme, body: "Added Pat Front Desk." });
  });

  it("a hire gets 403 and nothing is written", async () => {
    const { hire, acme } = await setup();
    expect((await call("POST", hire, { name: "Nope" })).status).toBe(403);
    expect((await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM contacts WHERE organization_id = ?", [acme]))?.n).toBe(1);
  });

  it("a lead can't add to a client it isn't assigned to", async () => {
    const { lead } = await setup();
    expect((await call("POST", lead, { client: "other.example", name: "Nope" })).status).toBe(403);
  });

  it("refuses opt-in/out, bad fields, and a taken email", async () => {
    const { lead } = await setup();
    expect((await call("POST", lead, { name: "Opt", opted_in: true })).status).toBe(400);
    expect((await call("POST", lead, { name: "Opt", opted_out: false })).status).toBe(400);
    expect((await call("POST", lead, { email: "x@acme.example" })).status).toBe(400);
    expect((await call("POST", lead, { name: "Bad", email: "not-an-email" })).status).toBe(400);
    expect((await call("POST", lead, { name: "Bad", address: { street: "1 Main" } })).status).toBe(400);
    expect((await call("POST", lead, { name: "Dup", email: "dana@acme.example" })).status).toBe(409);
  });
});

describe("PATCH /api/agent-contacts", () => {
  it("the lead edits only the sent fields and logs the change", async () => {
    const { lead, dana } = await setup();
    const response = await call("PATCH", lead, { id: dana, phone: "416-555-0100", address: { city: "Toronto", country: "Canada" } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { contact: { name: string; email: string; phone: string; address: { text: string } } };
    expect(body.contact).toMatchObject({ name: "Dana Staff", email: "dana@acme.example", phone: "416-555-0100" });
    expect(body.contact.address.text).toBe("Toronto, Canada");
    const activity = await sql.get<{ actor_kind: string; body: string }>(
      "SELECT actor_kind, body FROM activities WHERE contact_id = ? AND actor_kind = 'agent'",
      [dana],
    );
    expect(activity?.actor_kind).toBe("agent");
    expect(activity?.body).toContain("Updated Dana Staff");
  });

  it("primary: true moves the main contact", async () => {
    const { lead, dana } = await setup();
    const made = (await (await call("POST", lead, { name: "New Main" })).json()) as { contact: { id: string } };
    expect((await call("PATCH", lead, { id: made.contact.id, primary: true })).status).toBe(200);
    const rows = await sql.all<{ id: string; is_primary: number }>("SELECT id, is_primary FROM contacts WHERE id IN (?, ?)", [dana, made.contact.id]);
    expect(Object.fromEntries(rows.map((row) => [row.id, row.is_primary]))).toEqual({ [dana]: 0, [made.contact.id]: 1 });
  });

  it("a hire gets 403, another client's contact is 404, opt flags are 400, unknown id is 404", async () => {
    const { lead, hire, dana, olive } = await setup();
    expect((await call("PATCH", hire, { id: dana, title: "Owner" })).status).toBe(403);
    expect((await call("PATCH", lead, { id: olive, title: "Owner" })).status).toBe(404);
    expect((await call("PATCH", lead, { id: dana, opted_out: true })).status).toBe(400);
    expect((await call("PATCH", lead, { id: "missing-id", title: "Owner" })).status).toBe(404);
    const row = await sql.get<{ title: string | null; opted_out: number }>("SELECT title, opted_out FROM contacts WHERE id = ?", [dana]);
    expect(row).toEqual({ title: null, opted_out: 0 });
  });

  it("an email another contact uses is a 409", async () => {
    const { lead, dana } = await setup();
    await call("POST", lead, { name: "Pat", email: "pat@acme.example" });
    expect((await call("PATCH", lead, { id: dana, email: "pat@acme.example" })).status).toBe(409);
  });
});

describe("no deletes", () => {
  it("the route exports no DELETE handler", async () => {
    const route = (await import("@/app/api/agent-contacts/route")) as Record<string, unknown>;
    expect(route.DELETE).toBeUndefined();
  });
});
