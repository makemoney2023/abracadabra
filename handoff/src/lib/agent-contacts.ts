import { createAgentContact, CRM_ERRORS, formatContactAddress, listOrgContacts, updateAgentContact, type Contact, type ContactAddressInput, type CrmError } from "@/db/crm";
import type { Sql } from "@/db/sql";
import { resolveClientRef, type AgentPrincipal } from "@/lib/agent-work-filing";

/**
 * Contacts for client agents (GET/POST/PATCH /api/agent-contacts on the hq. host).
 * - Any agent assigned to a client reads that client's contacts.
 * - Only the client's lead agent adds or edits them, on its own client only. Same validation and activity log as
 *   staff (src/db/crm.ts), with actor_kind 'agent'.
 * - No deletes. Agents can never set opted_in or opted_out (a body with either is 400); they read them only.
 */

type Fail = { ok: false; status: 400 | 403 | 404 | 409; message: string };

export function clientRefFrom(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const client = value.trim();
  if (!client) return null;
  return client.includes(".") ? { domain: client } : /^[0-9a-f-]{36}$/.test(client) ? { organization_id: client } : { space_slug: client };
}

async function pickClient(sql: Sql, agent: AgentPrincipal, client: unknown): Promise<{ ok: true; organizationId: string; role: "lead" | "hire" } | Fail> {
  let organizationId: string;
  if (client) {
    const ref = await resolveClientRef(sql, client);
    if (!ref.ok) return { ok: false, status: ref.status === 404 ? 404 : 400, message: ref.message };
    organizationId = ref.organizationId;
  } else {
    if (agent.assignments.length !== 1) return { ok: false, status: 400, message: "Name the client (org id, domain, or space slug)." };
    organizationId = agent.assignments[0].organizationId;
  }
  const assignment = agent.assignments.find((row) => row.organizationId === organizationId);
  if (!assignment) return { ok: false, status: 403, message: "This agent is not assigned to that client." };
  return { ok: true, organizationId, role: assignment.role };
}

export type AgentContact = {
  id: string; name: string | null; title: string | null; email: string | null; phone: string | null; primary: boolean;
  address: { line1: string | null; line2: string | null; city: string | null; region: string | null; postal_code: string | null; country: string | null; text: string | null };
  opted_in: boolean; opted_out: boolean;
};

function shape(row: Contact & { opted_in?: number; opted_out?: number }): AgentContact {
  return {
    id: row.id, name: row.name, title: row.title, email: row.email, phone: row.phone, primary: row.is_primary === 1,
    address: {
      line1: row.address_line1 ?? null, line2: row.address_line2 ?? null, city: row.city ?? null, region: row.region ?? null,
      postal_code: row.postal_code ?? null, country: row.country ?? null, text: formatContactAddress(row),
    },
    opted_in: row.opted_in === 1, opted_out: row.opted_out === 1,
  };
}

export async function listAgentContacts(sql: Sql, agent: AgentPrincipal, client: unknown): Promise<{ ok: true; organization_id: string; contacts: AgentContact[] } | Fail> {
  const picked = await pickClient(sql, agent, client);
  if (!picked.ok) return picked;
  const rows = await listOrgContacts(sql, picked.organizationId);
  return { ok: true, organization_id: picked.organizationId, contacts: rows.map(shape) };
}

const OPT_KEYS = ["opted_in", "opted_out", "opt_in", "opt_out", "optedIn", "optedOut"];
const ADDRESS_KEYS: [string, keyof ContactAddressInput][] = [
  ["line1", "line1"], ["line2", "line2"], ["city", "city"], ["region", "region"], ["postal_code", "postalCode"], ["country", "country"],
];

function optional(value: unknown, field: string): { ok: true; value: string | null | undefined } | Fail {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || typeof value === "string") return { ok: true, value };
  return { ok: false, status: 400, message: `${field} must be text.` };
}

/** Reads the shared fields. create: name is required. Refuses opt-in/out and unknown address parts. */
function readFields(body: Record<string, unknown>, create: boolean) {
  if (OPT_KEYS.some((key) => key in body)) {
    return { ok: false as const, status: 400 as const, message: "Agents can't change opt-in or opt-out. Ask Client Services." };
  }
  const out: { name?: string; email?: string | null; phone?: string | null; title?: string | null; primary?: boolean; address?: ContactAddressInput } = {};
  for (const field of ["name", "email", "phone", "title"] as const) {
    const read = optional(body[field], field);
    if (!read.ok) return read;
    if (read.value !== undefined) out[field] = read.value as string;
  }
  if (create && !(typeof out.name === "string" && out.name.trim())) return { ok: false as const, status: 400 as const, message: "name is required." };
  if (body.primary !== undefined) {
    if (typeof body.primary !== "boolean") return { ok: false as const, status: 400 as const, message: "primary must be true or false." };
    if (body.primary === false && !create) return { ok: false as const, status: 400 as const, message: "To change the main contact, set primary: true on the new one." };
    out.primary = body.primary;
  }
  if (body.address !== undefined && body.address !== null) {
    if (typeof body.address !== "object" || Array.isArray(body.address)) return { ok: false as const, status: 400 as const, message: "address must be an object." };
    const raw = body.address as Record<string, unknown>;
    const unknown = Object.keys(raw).filter((key) => !ADDRESS_KEYS.some(([name]) => name === key));
    if (unknown.length) return { ok: false as const, status: 400 as const, message: `Unknown address field: ${unknown[0]}. Use line1, line2, city, region, postal_code, country.` };
    const address: ContactAddressInput = {};
    for (const [name, key] of ADDRESS_KEYS) {
      const read = optional(raw[name], `address.${name}`);
      if (!read.ok) return read;
      if (read.value !== undefined) address[key] = read.value;
    }
    out.address = address;
  }
  return { ok: true as const, fields: out };
}

function crmFail(error: CrmError): Fail {
  if (error === "email_taken") return { ok: false, status: 409, message: CRM_ERRORS.email_taken };
  if (error === "missing") return { ok: false, status: 404, message: "No such contact on this client." };
  if (error === "invalid") {
    return { ok: false, status: 400, message: "Check the fields: name up to 200, a valid email, phone up to 40, title up to 120, address lines up to 200, city and region up to 120, postal code up to 20, country up to 80." };
  }
  return { ok: false, status: 403, message: CRM_ERRORS[error] };
}

export async function createContactForAgent(sql: Sql, agent: AgentPrincipal, body: Record<string, unknown>, now: number): Promise<{ ok: true; contact: AgentContact } | Fail> {
  const picked = await pickClient(sql, agent, clientRefFrom(body.client));
  if (!picked.ok) return picked;
  if (picked.role !== "lead") return { ok: false, status: 403, message: "Only the client's lead agent adds or edits contacts." };
  const read = readFields(body, true);
  if (!read.ok) return read;
  const { fields } = read;
  const made = await createAgentContact(sql, agent.agentId, {
    organizationId: picked.organizationId, name: fields.name!, email: fields.email ?? undefined, phone: fields.phone ?? undefined,
    title: fields.title ?? undefined, primary: fields.primary === true, address: fields.address,
  }, now);
  return made.ok ? { ok: true, contact: shape(made.value) } : crmFail(made.error);
}

export async function updateContactForAgent(sql: Sql, agent: AgentPrincipal, body: Record<string, unknown>, now: number): Promise<{ ok: true; contact: AgentContact } | Fail> {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return { ok: false, status: 400, message: "id is required." };
  const owner = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM contacts WHERE id = ?", [id]);
  if (!owner?.organization_id) return { ok: false, status: 404, message: "No such contact on this client." };
  const picked = await pickClient(sql, agent, body.client ? clientRefFrom(body.client) : { organization_id: owner.organization_id });
  // A contact on a client this agent isn't on reads as missing, so ids don't leak across clients.
  if (!picked.ok) return picked.status === 404 || picked.status === 403 ? { ok: false, status: 404, message: "No such contact on this client." } : picked;
  if (picked.organizationId !== owner.organization_id) return { ok: false, status: 404, message: "No such contact on this client." };
  if (picked.role !== "lead") return { ok: false, status: 403, message: "Only the client's lead agent adds or edits contacts." };
  const read = readFields(body, false);
  if (!read.ok) return read;
  const updated = await updateAgentContact(sql, agent.agentId, { organizationId: picked.organizationId, contactId: id, ...read.fields }, now);
  return updated.ok ? { ok: true, contact: shape(updated.value) } : crmFail(updated.error);
}
