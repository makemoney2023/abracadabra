import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, RETRY_TEXT } from "../src/http.js";
import { offerPrompt, systemPrompt, SYSTEM_PROMPT } from "../src/model.js";
import { asksNextStep, CALENDAR_OPEN, checkedSentences, hasOffer, localReply, offerState, postCheck, uiActionFor } from "../src/policy.js";
import { SITE_KNOWLEDGE } from "../src/site-knowledge.js";

const ENV = { AI_GATEWAY_TOKEN: "t", CF_ACCOUNT_ID: "acct" };
const OFFER_LINE = "You can book a thirty-minute working session right here in this chat.";

async function collect(deltas, options) {
  const out = [];
  for await (const part of checkedSentences(deltas, options)) out.push(part);
  return out;
}
async function* from(...parts) { for (const part of parts) yield part; }

const said = (...texts) => ({ messages: texts.flatMap((text) => [{ role: "user", text: "q" }, { role: "assistant", text }]) });

test("offers are spotted, plain uses of book are not", () => {
  assert.equal(hasOffer(OFFER_LINE), true);
  assert.equal(hasOffer("Not sure where to start? Take the Readiness Check."), true);
  assert.equal(hasOffer("A visitor can start an estimate and book, so the request stays with the page."), false);
  assert.equal(hasOffer("We build custom apps around your work."), false);
  assert.equal(hasOffer("We built a website where visitors start an estimate and book a job."), false);
  assert.equal(hasOffer("Would you like to book a thirty-minute working session?"), true);
  assert.equal(hasOffer("Pick a time that works."), true);
});

test("explicit asks count as asking for a next step; ordinary questions do not", () => {
  for (const ask of ["book a call", "How much does a custom app cost?", "How long does a typical project take?", "Where do I start?", "I'm not sure what we need", "Can I talk to a person?", "how do we get started"]) {
    assert.equal(asksNextStep(ask), true, ask);
  }
  for (const plain of ["What do you do?", "Can I see examples of your work?", "Why do you build on Cloudflare?", "We are a law firm drowning in documents.", "Do you integrate with QuickBooks?"]) {
    assert.equal(asksNextStep(plain), false, plain);
  }
});

test("offer state reads the saved replies: last offer, recent, and whether to drop", () => {
  assert.deepEqual(offerState({ messages: [] }, "What do you do?"), { offered: false, repliesSince: null, recent: false, asked: false, start: false, dropOffers: false });
  const last = offerState(said("We build apps.", OFFER_LINE), "Can I see your work?");
  assert.equal(last.repliesSince, 1);
  assert.equal(last.dropOffers, true);
  const two = offerState(said(OFFER_LINE, "We build apps."), "Tell me more");
  assert.equal(two.repliesSince, 2);
  assert.equal(two.dropOffers, true);
  const old = offerState(said(OFFER_LINE, "We build apps.", "It runs on Cloudflare."), "Tell me more");
  assert.equal(old.repliesSince, 3);
  assert.equal(old.offered, true);
  assert.equal(old.dropOffers, false);
  assert.equal(offerState(said("We build apps.", OFFER_LINE), "How much would that cost?").dropOffers, false);
  assert.equal(offerState({ messages: [], bookingOffered: true }, "hi").offered, true);
});

test("the prompt is told what was offered, and to offer when asked", () => {
  assert.equal(offerPrompt(undefined), "");
  assert.match(systemPrompt({ offers: offerState(said(OFFER_LINE), "What do you build?") }), /already offered the working session or the Readiness Check in your last answer\. Do not mention booking/);
  assert.match(systemPrompt({ voice: true, offers: offerState(said(OFFER_LINE, "a", "b"), "ok") }), /already offered .* 3 answers ago/);
  assert.match(systemPrompt({ offers: offerState(said(OFFER_LINE), "how much is it?") }), /asking about cost, timing.*in your own words: a thirty-minute working session/);
  assert.match(systemPrompt({ offers: offerState({ messages: [] }, "What do you do?") }), /Nothing has been offered yet/);
  for (const unsure of ["Where should we start?", "I'm not sure where to start.", "Is there a readiness assessment?"]) {
    assert.equal(offerState({ messages: [] }, unsure).start, true, unsure);
    assert.match(systemPrompt({ offers: offerState(said(OFFER_LINE), unsure) }), /suggest the Readiness Check first/, unsure);
  }
  assert.equal(offerState({ messages: [] }, "How much is it?").start, false);
});

test("the base prompt no longer ends every answer with the session", () => {
  assert.doesNotMatch(SYSTEM_PROMPT, /End with one next step when it fits/);
  assert.doesNotMatch(SYSTEM_PROMPT, /in the session/);
  assert.match(SYSTEM_PROMPT, /Offer a next step only when the visitor asks about cost, timing, getting started, or talking to a person/);
  assert.match(SYSTEM_PROMPT, /never in two answers in a row/);
  assert.match(SITE_KNOWLEDGE, /NEXT STEPS \(options, not a closing line/);
});

test("guard drops a repeat offer sentence but keeps the answer", async () => {
  const parts = await collect(from("We built the StrongFoam CRM. ", OFFER_LINE, " What slows your team down most?"), { dropOffers: true });
  assert.deepEqual(parts.map((p) => p.text), ["We built the StrongFoam CRM.", "What slows your team down most?"]);
  const kept = await collect(from("We built the StrongFoam CRM. ", OFFER_LINE), { dropOffers: false });
  assert.equal(kept.length, 2);
});

test("guard never leaves an empty reply", async () => {
  const parts = await collect(from(OFFER_LINE), { dropOffers: true });
  assert.deepEqual(parts.map((p) => p.text), [OFFER_LINE]);
  assert.ok(parts[0].flags.includes("repeat_offer"));
  const voice = await collect(from("You can book a thirty-minute working session, right here in this chat, any time this week."), { dropOffers: true, firstClause: true });
  assert.ok(voice.length >= 1);
});

test("canned replies do not pitch booking unless asked", () => {
  assert.equal(hasOffer(RETRY_TEXT), false);
  assert.equal(RETRY_TEXT, "Sorry, that took longer than it should. Please try again.");
  const grounded = postCheck("We don't have any examples to share yet.");
  assert.ok(grounded.flags.includes("false_claim"));
  assert.equal(hasOffer(grounded.text), false);
  assert.equal(hasOffer(localReply("What do you do?")), false);
  assert.equal(hasOffer(localReply("email me")), false);
  // Explicit asks still get the offer.
  assert.match(localReply("book a call"), /thirty-minute working session/);
  assert.match(localReply("what's your pricing?"), /thirty-minute working session/);
  assert.match(localReply("where to start? not sure"), /Readiness Check/);
  assert.equal(uiActionFor("book a call"), "open_booking");
});

function sse(text) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: text })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

async function conversation(replies, env = ENV) {
  const calls = [];
  const deps = {
    now: () => 1_700_000_000_000,
    limits: { messages: new Map(), sessions: new Map() },
    rooms: new Map(),
    sendHandoff: async () => {},
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body));
      return sse(replies[calls.length - 1]);
    },
  };
  const opened = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/session", {
    method: "POST", headers: { origin: "http://127.0.0.1:4500", "content-type": "application/json", "cf-connecting-ip": "203.0.113.91" }, body: "{}",
  }), ENV, deps);
  const cookie = `abra_chat=${opened.headers.get("set-cookie").match(/abra_chat=([^;]+)/)[1]}`;
  const say = async (text) => {
    const response = await handleRequest(new Request("https://abra-ca-dabra.app/api/chat/message", {
      method: "POST", headers: { origin: "https://abra-ca-dabra.app", "content-type": "application/json", "cf-connecting-ip": "203.0.113.91", cookie }, body: JSON.stringify({ text }),
    }), env, deps);
    const raw = await response.text();
    const events = [...raw.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map(([, event, data]) => ({ event, data: JSON.parse(data) }));
    return events.find((e) => e.event === "final")?.data.text;
  };
  return { say, calls };
}

test("typed chat: no back-to-back offers unless the visitor asks, and the prompt knows", async () => {
  const pitch = `We build custom apps. ${OFFER_LINE}`;
  const { say, calls } = await conversation([pitch, pitch, pitch, pitch]);
  assert.equal(await say("What do you build?"), pitch);
  assert.equal(await say("Can I see examples?"), "We build custom apps.");
  assert.match(calls[1].messages[0].content, /already offered .* in your last answer/);
  assert.equal(await say("Why Cloudflare?"), "We build custom apps.");
  assert.match(calls[2].messages[0].content, /already offered .* 2 answers ago/);
  // Asked about cost: the offer goes through even right after another.
  // Same offer sentence as three answers ago: kept (they asked), but in words not used yet.
  const cost = await say("How much would it cost?");
  assert.match(cost, /^We build custom apps\. /);
  assert.equal(hasOffer(cost), true);
  assert.doesNotMatch(cost, /book a thirty-minute working session right here in this chat/);
  assert.match(calls[3].messages[0].content, /asking about cost, timing/);
});

test("our own names and page links are not jargon; real jargon still is", () => {
  const course = "The LLM Leverage course is a self-paced course for better answers from any model https://abra-ca-dabra.app/course/llm-leverage/. See the case study at https://abra-ca-dabra.app/portfolio/llm-leverage/.";
  const out = postCheck(course);
  assert.deepEqual(out.flags, []);
  assert.equal(out.text, course);
  assert.deepEqual(postCheck("The LLM-Leverage course helps.").flags, []);
  for (const bad of ["We leverage AI for you.", "You can leverage our tools.", "A seamless, robust platform.", "Leverage the LLM Leverage course."]) {
    assert.ok(postCheck(bad).flags.includes("jargon"), bad);
  }
});

test("a sentence saying a client is like the visitor is dropped; plain past work stays", () => {
  const out = postCheck("We've worked with businesses like StrongFoam, which has a similar fleet of vehicles. We built their CRM, the record you work in.");
  assert.ok(out.flags.includes("client_claim"));
  assert.equal(out.text, "We built their CRM, the record you work in.");
  assert.equal(postCheck("StrongFoam is in the same industry as you.").flags.includes("client_claim"), true);
  assert.equal(postCheck("pirx.ca had a similar setup to yours.").flags.includes("client_claim"), true);
  for (const fine of ["We built the StrongFoam CRM, the record you work in.", "We can build something similar for your roofing company.", "For StrongFoam we built a site where a visitor can start an estimate."]) {
    assert.deepEqual(postCheck(fine).flags, [], fine);
  }
});

test("a reply that was only a client claim is not left empty", async () => {
  const parts = await collect(from("StrongFoam has a similar fleet to yours."));
  assert.equal(parts.length, 1);
  assert.doesNotMatch(parts[0].text, /StrongFoam/);
});

test("calendar open: contact asks are dropped, the booking words stay, never empty", async () => {
  const parts = await collect(from("You can book a thirty-minute working session right here in this chat. ", "Just leave your name and email in the chat. ", "What's your email address?"), { calendarOpen: true });
  assert.deepEqual(parts.map((p) => p.text), ["You can book a thirty-minute working session right here in this chat."]);
  const only = await collect(from("Please leave your name and email so we can schedule."), { calendarOpen: true });
  assert.deepEqual(only.map((p) => p.text), [CALENDAR_OPEN]);
  const closed = await collect(from("Leave your name and email here."), { calendarOpen: false });
  assert.equal(closed.length, 1);
});

test("typed: asking to book mid-chat tells the model the calendar is open and strips contact asks", async () => {
  const reply = "You can book a thirty-minute working session right here in this chat. To get started, leave your name and email in the chat, and a person will review it. What's your name and email address?";
  const { say, calls } = await conversation(["We build apps for trades.", reply], { ...ENV, CAL_LINK: "abra/30min" });
  await say("What do you build?");
  const final = await say("OK, I want to book a call.");
  assert.equal(final, "You can book a thirty-minute working session right here in this chat.");
  assert.match(calls[1].messages[0].content, /booking calendar is already open in this chat.*Do not ask for their name, email/);
});

test("typed: without a Cal.com link the two-times form opens, so asking for an email is fine", async () => {
  const reply = "Leave your email and two times that work, and a person will send the invite.";
  const { say, calls } = await conversation([reply]);
  assert.equal(await say("book a call"), reply);
  assert.doesNotMatch(calls[0].messages[0].content, /calendar is already open/);
});

test("a sentence leaning on a dropped client claim goes too", async () => {
  const parts = await collect(from("We've worked with companies like StrongFoam, which has a similar fleet size. ", "We also built a website for their sister company, Milrcorr. ", "Our Custom apps service could help you schedule your vans. ", "We also connect to your tools."));
  assert.deepEqual(parts.map((p) => p.text), ["Our Custom apps service could help you schedule your vans.", "We also connect to your tools."]);
});

test("after a dropped client claim, a leftover \"also\" is taken out", async () => {
  const parts = await collect(from("We've worked with companies like StrongFoam, which has a similar fleet. ", "Our AI assistants service can also help with scheduling."));
  assert.deepEqual(parts.map((p) => p.text), ["Our AI assistants service can help with scheduling."]);
  assert.equal(hasOffer("You can pick a thirty-minute time in the calendar right here."), true);
});
