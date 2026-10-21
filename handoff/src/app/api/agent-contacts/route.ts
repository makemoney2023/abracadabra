import { NextResponse } from "next/server";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { clientRefFrom, createContactForAgent, listAgentContacts, updateContactForAgent } from "@/lib/agent-contacts";
import { agentForToken } from "@/lib/agent-work-filing";

export const dynamic = "force-dynamic";

async function session(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const agent = await agentForToken(sql, request.headers.get("authorization"));
  return { sql, agent };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Contacts of one of this agent's clients. Bearer agent token. ?client= (org id, domain, or space slug); optional with one client. */
export async function GET(request: Request) {
  const { sql, agent } = await session(request);
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const result = await listAgentContacts(sql, agent, clientRefFrom(new URL(request.url).searchParams.get("client")));
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}

/**
 * Lead agent adds a contact to its own client. Body: { client?, name, email?, phone?, title?, primary?,
 * address?: { line1?, line2?, city?, region?, postal_code?, country? } }. Hires 403. opted_in/opted_out: 400. Email in use: 409.
 */
export async function POST(request: Request) {
  const { sql, agent } = await session(request);
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Check the body." }, { status: 400 });
  const result = await createContactForAgent(sql, agent, body, Date.now());
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}

/**
 * Lead agent edits a contact on its own client. Body: { id, name?, email?, phone?, title?, primary?: true, address? }.
 * Sent fields change; "" or null clears an optional one. No deletes, no opt-in/opt-out.
 */
export async function PATCH(request: Request) {
  const { sql, agent } = await session(request);
  if (!agent) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Check the body." }, { status: 400 });
  const result = await updateContactForAgent(sql, agent, body, Date.now());
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result);
}
