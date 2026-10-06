import { NextResponse } from "next/server";
import { githubEventsQueue, githubWebhookSecret } from "./secrets";
import { githubSignatureOk } from "./sign";

/** Check the signature, then the headers, then the body, then queue the delivery. */
export async function acceptGithubWebhook(request: Request): Promise<Response> {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!githubSignatureOk(githubWebhookSecret(), raw, signature)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  const deliveryId = (request.headers.get("x-github-delivery") ?? "").trim();
  const event = (request.headers.get("x-github-event") ?? "").trim();
  if (!deliveryId || !event || deliveryId.length > 200 || event.length > 64) {
    return NextResponse.json({ error: "Check the headers." }, { status: 400 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Check the body." }, { status: 400 });
  }
  const queue = githubEventsQueue();
  if (!queue) {
    return NextResponse.json({ error: "GitHub events are not ready." }, { status: 503 });
  }
  await queue.send({ source: "github", deliveryId, event, payload });
  return NextResponse.json({ ok: true }, { status: 202 });
}
