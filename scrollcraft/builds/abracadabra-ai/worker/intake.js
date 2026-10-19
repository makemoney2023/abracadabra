import { z } from "zod";

const intakeSchema = z.object({
  name: z.string().trim().min(1, "Add your name.").max(120),
  email: z.string().trim().email("Add a real email address.").max(200),
  company: z.string().trim().max(160).optional().default(""),
  need: z.enum(["Film", "Website", "Product", "Course", "Not sure"]),
  budget: z.enum(["Under $15k", "$15–40k", "$40k+", "Not sure"]),
  timeline: z.enum(["Now", "This month", "This quarter", "Not sure"]),
  message: z.string().trim().max(4000).optional().default(""),
  company_website: z.string().optional().default(""),
});

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;

export function resetIntakeRateLimit() {
  hits.clear();
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local";
}

function limited(ip, now) {
  const recent = (hits.get(ip) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

async function readPayload(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function wantsHtml(request) {
  return request.headers.get("x-intake") !== "fetch";
}

function fieldError(error) {
  const issue = error.issues[0];
  const field = String(issue?.path?.[0] || "form");
  return { field, message: issue?.message || "Check the form and try again." };
}

function htmlResponse(status, title, message) {
  const body = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><body><main><h1>${title}</h1><p>${message}</p><p><a href="/start/">Back to the form</a></p></main></body></html>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export function intakeLetter(payload) {
  return [
    `${payload.name} (${payload.email})`,
    payload.company ? `Company: ${payload.company}` : "",
    `Need: ${payload.need}`,
    `Budget: ${payload.budget}`,
    `Timeline: ${payload.timeline}`,
    "",
    payload.message || "(no extra note)",
  ].filter((line) => line !== "").join("\n");
}

export async function sendIntakeEmail(env, payload) {
  const key = env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.INTAKE_FROM || "Abracadabra <intake@abra-ca-dabra.app>",
      to: [env.INTAKE_TO || "houdini@abra-ca-dabra.app"],
      reply_to: payload.email,
      subject: `Project inquiry from ${payload.name}`,
      text: intakeLetter(payload),
    }),
  });
  if (!response.ok) throw new Error(`email provider ${response.status}`);
  return response.json();
}

export async function handleIntake(request, env, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const send = deps.send || sendIntakeEmail;
  const html = wantsHtml(request);
  if (limited(clientIp(request), now)) {
    return html
      ? htmlResponse(429, "Slow down", "Too many notes from this network. Email houdini@abra-ca-dabra.app.")
      : Response.json({ field: "form", message: "Too many notes from this network. Try again later." }, { status: 429 });
  }
  let raw;
  try {
    raw = await readPayload(request);
  } catch {
    return html
      ? htmlResponse(400, "Check the form", "We could not read that submission.")
      : Response.json({ field: "form", message: "We could not read that submission." }, { status: 400 });
  }
  const parsed = intakeSchema.safeParse(raw);
  if (!parsed.success) {
    const error = fieldError(parsed.error);
    return html
      ? htmlResponse(400, "Check the form", error.message)
      : Response.json(error, { status: 400 });
  }
  if (parsed.data.company_website) {
    return html
      ? Response.redirect(new URL("/start/thanks/", request.url), 303)
      : Response.json({ ok: true, sent: false });
  }
  try {
    await send(env, parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The mail service failed.";
    return html
      ? htmlResponse(502, "Not sent", "We could not deliver that. Email houdini@abra-ca-dabra.app.")
      : Response.json({ field: "form", message }, { status: 502 });
  }
  return html
    ? Response.redirect(new URL("/start/thanks/", request.url), 303)
    : Response.json({ ok: true, sent: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/intake") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return handleIntake(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
