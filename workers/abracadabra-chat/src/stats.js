// Anonymous chat stats: one row per chat session, no words, no contact details, no IP, no session id.
// The row is written (and rewritten) by the session's idle alarm, keyed by a random id that only the
// session knows, so a returning visitor updates their row instead of counting twice. Rows live in one
// SQLite Durable Object (ChatStatsDO) and are read back by the token-protected export.
import { sitePage } from "./page-context.js";
import { TOPICS } from "./recap.js";
import { READINESS } from "./readiness-questions.js";

export const STATS_KEEP_WEEKS = 26;
export const STATS_MAX_WEEKS = 12;

const INTENTS = [
  ["pricing", /\b(cost|costs|price|pricing|budget|quote|how much|fees?|rates?)\b/i],
  ["timeline", /\b(how long|timeline|weeks?|months?|when can|start date|deadline)\b/i],
  ["privacy and security", /\b(privacy|private|secure|security|data|gdpr|pipeda|hipaa|confidential)\b/i],
  ["integrations", /\b(integrat\w*|connect\w*|api|zapier|hubspot|salesforce|quickbooks|servicetitan|google|microsoft|shopify)\b/i],
  ["about the studio", /\b(who are you|who is behind|team|founder|where are you|located|canada|toronto)\b/i],
];

const SPEAKERS = new Set(["luna", "thalia", "andromeda", "asteria", "orion", "helena", "apollo", "zeus"]);
const BANDS = new Set(Object.keys(READINESS.bands));

/** Week label for a time, in the studio's zone: ISO week, e.g. "2026-W43". */
export function weekOf(ms, zone = "America/Toronto") {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ms)).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The weeks to report, newest last: the `count` weeks up to and including the one holding `now`. */
export function recentWeeks(now, count) {
  const weeks = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const label = weekOf(now - i * 7 * 86400000);
    if (!weeks.includes(label)) weeks.push(label);
  }
  return weeks;
}

/** One session, reduced to counts and flags. Nothing in it can name or reach the visitor. */
export function sessionRow(session) {
  const asked = (session.messages || []).filter((m) => m.role === "user" && !m.demo && !/^I (?:finished the Readiness Check|ran the mini-audit)/.test(m.text || ""));
  const topics = {};
  const intents = {};
  for (const m of asked) {
    for (const [name, re] of TOPICS) if (re.test(m.text || "")) topics[name] = (topics[name] || 0) + 1;
    for (const [name, re] of INTENTS) if (re.test(m.text || "")) intents[name] = (intents[name] || 0) + 1;
  }
  const band = String(session.readiness?.band || "").toLowerCase();
  return {
    week: weekOf(session.createdAt || Date.now()),
    questions: Number(session.messageCount || 0),
    voiceCalls: Number(session.voiceCalls || 0),
    voiceTurns: (session.messages || []).filter((m) => m.role === "user" && m.voice).length,
    // The Aura voice the chat's calls used (TTS_SPEAKER or the A/B test), so results can be compared.
    voiceSpeaker: SPEAKERS.has(session.voiceSpeaker) ? session.voiceSpeaker : "",
    auditsStarted: (session.audits || []).length,
    auditsDone: (session.audits || []).filter((a) => a.result).length,
    demos: Number(session.demo?.runs || 0),
    recapCards: Number(session.recapShown || 0),
    clips: (session.clipsShown || []).length,
    topics,
    intents,
    startPage: sitePage(session.startPage || session.page) || "unknown",
    bookingOffered: Boolean(session.bookingOffered),
    bookingOpened: Boolean(session.bookingOpened),
    booked: Boolean(session.bookingCompleted),
    contact: Boolean(session.contact),
    readinessClicked: Boolean(session.readinessClicked),
    readinessStarted: Boolean(session.readiness?.token),
    readinessDone: Boolean(session.readiness?.done),
    readinessBand: session.readiness?.done && BANDS.has(band) ? band : "",
    replyFailures: Number(session.replyFailures || 0),
  };
}

const add = (map, key, by = 1) => { if (key) map[key] = (map[key] || 0) + by; };
const top = (map, n = 10) => Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)
  .map(([name, count]) => ({ name, count }));
const rate = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** Totals for one week of rows. */
export function weekSummary(week, rows) {
  const s = {
    week, chats: rows.length, chatsWithQuestions: 0, questions: 0, voiceChats: 0, voiceTurns: 0,
    bookingOffered: 0, bookingOpened: 0, booked: 0, contacts: 0,
    readinessClicked: 0, readinessStarted: 0, readinessDone: 0, replyFailures: 0,
    auditsStarted: 0, auditsDone: 0, demos: 0, recapCards: 0, clips: 0,
  };
  const speakers = {};
  const topics = {};
  const intents = {};
  const pages = {};
  const bands = {};
  for (const r of rows) {
    if (r.questions > 0) s.chatsWithQuestions += 1;
    s.questions += r.questions || 0;
    if (r.voiceCalls > 0) s.voiceChats += 1;
    s.voiceTurns += r.voiceTurns || 0;
    for (const key of ["bookingOffered", "bookingOpened", "booked", "contact", "readinessClicked", "readinessStarted", "readinessDone"]) {
      if (r[key]) s[key === "contact" ? "contacts" : key] += 1;
    }
    s.replyFailures += r.replyFailures || 0;
    for (const key of ["auditsStarted", "auditsDone", "demos", "recapCards", "clips"]) s[key] += Number(r[key] || 0);
    if (r.voiceCalls > 0) add(speakers, r.voiceSpeaker || "unknown");
    for (const [k, v] of Object.entries(r.topics || {})) add(topics, k, v);
    for (const [k, v] of Object.entries(r.intents || {})) add(intents, k, v);
    add(pages, r.startPage);
    add(bands, r.readinessBand);
  }
  const engaged = s.chatsWithQuestions;
  return {
    ...s,
    rates: {
      bookingOfferedPct: rate(s.bookingOffered, engaged),
      bookedPct: rate(s.booked, engaged),
      contactPct: rate(s.contacts, engaged),
      voicePct: rate(s.voiceChats, engaged),
      readinessDonePct: rate(s.readinessDone, s.readinessStarted),
      failuresPer100Questions: rate(s.replyFailures, s.questions),
    },
    topics: top(topics),
    intents: top(intents),
    startPages: top(pages, 15),
    readinessBands: top(bands),
    voiceSpeakers: top(speakers),
  };
}

export function statsCsv(summaries) {
  const cols = ["week", "chats", "chatsWithQuestions", "questions", "voiceChats", "voiceTurns", "bookingOffered", "bookingOpened",
    "booked", "contacts", "readinessClicked", "readinessStarted", "readinessDone", "replyFailures",
    "auditsStarted", "auditsDone", "demos", "recapCards", "clips"];
  const list = (items) => `"${items.map((i) => `${i.name}:${i.count}`).join("; ").replace(/"/g, "'")}"`;
  const lines = [[...cols, "topics", "intents", "startPages", "readinessBands", "voiceSpeakers"].join(",")];
  for (const s of summaries) lines.push([...cols.map((c) => s[c] ?? 0), list(s.topics), list(s.intents), list(s.startPages), list(s.readinessBands), list(s.voiceSpeakers || [])].join(","));
  return `${lines.join("\n")}\n`;
}

/** Storage behind the stats: the ChatStatsDO in production, a Map in tests and local runs. */
export function statsStore(env, deps) {
  if (env?.CHAT_STATS) {
    const stub = env.CHAT_STATS.get(env.CHAT_STATS.idFromName("all"));
    return {
      put: (id, row, now) => stub.fetch("https://stats/put", { method: "POST", body: JSON.stringify({ id, row, now }) }),
      weeks: async (weeks) => (await stub.fetch("https://stats/weeks", { method: "POST", body: JSON.stringify({ weeks }) })).json(),
    };
  }
  deps.statsRows ||= new Map();
  return {
    put: async (id, row) => { deps.statsRows.set(id, row); },
    weeks: async (weeks) => [...deps.statsRows.values()].filter((r) => weeks.includes(r.week)),
  };
}

/** Writes (or rewrites) this session's row. Never throws: stats must not break the chat. */
export async function recordSession(session, env, deps, now) {
  if (String(env?.CHAT_STATS_ENABLED || "true") === "false") return false;
  try {
    session.statsId ||= crypto.randomUUID();
    await statsStore(env, deps).put(session.statsId, sessionRow(session), now);
    return true;
  } catch (error) {
    console.error(`chat stats: ${error?.message || error}`);
    return false;
  }
}

/** The Durable Object that holds the rows. */
export class ChatStatsDO {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS rows (id TEXT PRIMARY KEY, week TEXT NOT NULL, updated INTEGER NOT NULL, data TEXT NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS rows_week ON rows (week)");
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    if (url.pathname === "/put") {
      const row = body.row || {};
      const now = Number(body.now) || Date.now();
      this.sql.exec("INSERT OR REPLACE INTO rows (id, week, updated, data) VALUES (?, ?, ?, ?)",
        String(body.id), String(row.week), now, JSON.stringify(row));
      this.sql.exec("DELETE FROM rows WHERE updated < ?", now - STATS_KEEP_WEEKS * 7 * 86400000);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/weeks") {
      const weeks = (Array.isArray(body.weeks) ? body.weeks : []).map(String).slice(0, STATS_MAX_WEEKS);
      if (!weeks.length) return Response.json([]);
      const rows = this.sql.exec(`SELECT data FROM rows WHERE week IN (${weeks.map(() => "?").join(",")})`, ...weeks).toArray();
      return Response.json(rows.map((r) => JSON.parse(r.data)));
    }
    return new Response(null, { status: 404 });
  }
}
