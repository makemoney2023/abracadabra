#!/usr/bin/env node
// Repetition check for the website chat (docs/conversation-plan.md, "How we measure").
//
//   node scripts/repetition-check.mjs                 offline: the guard, the variants and the prompt (no network)
//   node scripts/repetition-check.mjs --report FILE   counts openers and closers in a quality-check report
//   AI_GATEWAY_TOKEN=... CF_ACCOUNT_ID=... node scripts/repetition-check.mjs --live [--model 70b|8b] [--out FILE]
//                                                     ten scripted multi-turn chats against the real model
//
// Exit code 1 when a check fails. Live mode stores nothing and touches no session, HQ or mail.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(`--${name}`);

// The stock booking sentence the chat used to repeat word for word.
export const STOCK_BOOKING = /thirty-minute working session,? right here in this chat/i;
const BUSINESS_QUESTION = /\b(?:your|the) (?:business|company|team|work|industry)\b[^.!?]*\?\s*$|\bwhat (?:kind|type|sort) of business\b/i;
const PRAISE = /\b(?:good|great|excellent) question\b/i;

/** Measures for a list of conversations (each a list of assistant replies, in order). */
export function measure(conversations) {
  const totals = { answers: 0, businessCloser: 0, questionCloser: 0, backToBackQuestions: 0, weOpener: 0, repeatedOpener: 0, stockBooking: 0, praise: 0 };
  const opener = (text) => (String(text).toLowerCase().match(/[a-z']+/g) || []).slice(0, 2).join(" ");
  const closer = (text) => { const parts = String(text).trim().split(/(?<=[.!?])\s+/); return parts[parts.length - 1] || ""; };
  for (const replies of conversations) {
    let lastOpener = "";
    let lastQuestion = false;
    for (const reply of replies) {
      totals.answers += 1;
      const end = closer(reply);
      const question = /\?\s*$/.test(end);
      if (question) totals.questionCloser += 1;
      if (question && lastQuestion) totals.backToBackQuestions += 1;
      if (BUSINESS_QUESTION.test(end)) totals.businessCloser += 1;
      const open = opener(reply);
      if (/^we\b/.test(open)) totals.weOpener += 1;
      if (open && open === lastOpener) totals.repeatedOpener += 1;
      if (STOCK_BOOKING.test(reply)) totals.stockBooking += 1;
      if (PRAISE.test(reply)) totals.praise += 1;
      lastOpener = open;
      lastQuestion = question;
    }
  }
  return totals;
}

export function summary(totals) {
  const n = totals.answers || 1;
  const pct = (x) => `${x}/${totals.answers} (${Math.round((100 * x) / n)}%)`;
  return [
    `answers: ${totals.answers}`,
    `end with a question about their business/work: ${pct(totals.businessCloser)}`,
    `end with any question: ${pct(totals.questionCloser)}; two in a row: ${totals.backToBackQuestions}`,
    `open with "We": ${pct(totals.weOpener)}; same opener as the answer before: ${totals.repeatedOpener}`,
    `stock booking sentence: ${totals.stockBooking}; "good/great question": ${totals.praise}`,
  ].join("\n");
}

/** Live pass/fail thresholds (see the plan). */
export function liveFailures(totals) {
  const n = totals.answers || 1;
  const fails = [];
  if (totals.stockBooking > 0) fails.push("stock booking sentence used");
  if (totals.praise > 0) fails.push("filler praise used");
  if (totals.businessCloser / n > 0.25) fails.push("over 25% of answers end with a question about their business");
  if (totals.repeatedOpener / n > 0.2) fails.push("over 20% of answers open like the answer before");
  if (totals.backToBackQuestions / n > 0.25) fails.push("too many answers in a row end with a question");
  return fails;
}

// Ten short scripted chats: discovery, cost, examples, objections, goodbyes, a bot question.
export const SCRIPTS = [
  ["What do you do?", "We're a 6 person dental clinic and the front desk spends hours on reminder calls.", "How much would something like that cost?", "Thanks, that helps."],
  ["Can I see examples of your work?", "What did you build for pirx.ca?", "Interesting. Could you do something like that for a running club?", "Ok bye"],
  ["Is this a bot?", "Fair. We use QuickBooks and Jobber and re-type every invoice by hand.", "How would that work?", "Thanks!"],
  ["How much does a custom app cost?", "That sounds expensive for us.", "What would a small first piece look like?", "Ok, thanks."],
  ["We already have an IT guy. Why would we need you?", "He doesn't have time for AI stuff.", "Where would we start?"],
  ["Tell me about HQ", "Who approves the posts?", "Can it post to LinkedIn?", "Not right now, maybe next quarter."],
  ["How do I get my business to show up in ChatGPT answers?", "We're a law firm in Toronto.", "What is Schema?", "Cool, thanks"],
  ["Can you build an AI receptionist that answers our phones?", "We miss calls after 5pm and lose jobs. We're a plumbing company.", "Can it book jobs into our calendar?", "I'd like to talk to someone."],
  ["What's your process?", "How long does a project take?", "Do you work with small businesses?", "Great, that's all."],
  ["I'm the office manager at an accounting firm and we're drowning in client documents.", "Is our data safe?", "Do you integrate with Outlook?", "Thanks, bye."],
];

async function offline() {
  const policy = await import("../src/policy.js");
  const conv = await import("../src/conversation.js");
  const model = await import("../src/model.js");
  const fails = [];
  const check = (ok, label) => { if (!ok) fails.push(label); console.log(`${ok ? "ok  " : "FAIL"} ${label}`); };
  // 1. The prompt no longer hard-codes the stock booking sentence or "fifth grader".
  const prompt = model.systemPrompt({ offers: policy.offerState({ messages: [] }, "How much is it?") });
  const base = `${model.SYSTEM_PROMPT} ${model.TEXT_SUFFIX} ${model.VOICE_SUFFIX}`;
  check(!STOCK_BOOKING.test(base) && !STOCK_BOOKING.test(model.offerPrompt({ asked: true })), "prompt has no stock booking sentence");
  check(!/fifth grader/i.test(prompt), "prompt drops the fifth-grader line");
  check(/never say Good question/i.test(base), "prompt bans filler praise");
  // 2. Every fixed line has distinct variants, and a recent one is skipped.
  for (const [name, list] of Object.entries({ COST_LINES: policy.COST_LINES, CALENDAR_OPEN_LINES: policy.CALENDAR_OPEN_LINES, EMPTY_LINES: policy.EMPTY_LINES, PLAIN_LINES: policy.PLAIN_LINES, OFFER_LINES: policy.OFFER_LINES, ...Object.fromEntries(Object.entries(policy.LOCAL_LINES).map(([k, v]) => [`LOCAL_LINES.${k}`, v])) })) {
    check(list.length >= 2 && new Set(list).size === list.length, `${name}: ${list.length} distinct variants`);
    check(conv.pickVariant(list, { seed: 0, recent: [list[0]] }) !== list[0], `${name}: a recent variant is skipped`);
    for (const line of list) check(policy.postCheck(line).text === line, `${name}: passes the answer check as is: "${line.slice(0, 40)}…"`);
  }
  // 3. The repeat guard drops a near copy but never empties a reply.
  const collect = async (text, options) => { const out = []; for await (const part of policy.checkedSentences((async function* () { yield text; })(), options)) out.push(part.text || part.replace); return out; };
  const recent = ["We build custom software around the work you already do. What job takes the most time each week?"];
  const guarded = await collect("We build custom software around the work you already do. Our Voice service answers calls from your records.", { recent });
  check(guarded.length === 1 && /Voice service/.test(guarded[0]), "repeat guard drops the copied sentence, keeps the new one");
  const only = await collect("We build custom software around the work you already do.", { recent });
  check(only.length === 1, "repeat guard never empties a reply");
  const praise = await collect("Great question! We build custom apps.", {});
  check(praise.join(" ") === "We build custom apps.", "filler praise is taken out");
  // 4. Endings and visitor memory.
  check(conv.endingIntent("thanks, bye") && !conv.endingIntent("thanks, how much is it?"), "goodbyes are detected, questions are not");
  const visitor = conv.updateVisitor(null, "We're a 6 person dental clinic on Dentrix and the front desk spends hours on reminder calls.");
  check(visitor.industry === "dental clinic" && visitor.tools.includes("Dentrix") && /reminder calls/.test(visitor.pain), "visitor memory keeps industry, tools and pain");
  check(/KNOWN ABOUT THE VISITOR/.test(conv.conversationNotes({ messages: [], visitor }, "ok")), "visitor memory reaches the prompt");
  return fails;
}

function fromReport(file) {
  const byModel = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^- \*\*([^*]+)\*\* (?:pass|FAIL[^·]*?)\s*· [^:]*?ms: (.*)$/.exec(line);
    if (!match) continue;
    (byModel[match[1]] ||= []).push([match[2]]);
  }
  for (const [label, conversations] of Object.entries(byModel)) console.log(`## ${label}\n${summary(measure(conversations))}\n`);
  return [];
}

async function live() {
  const { DEFAULT_MODEL, FALLBACK_MODEL, streamChat } = await import("../src/model.js");
  const policy = await import("../src/policy.js");
  const conv = await import("../src/conversation.js").catch(() => null);
  if (!process.env.AI_GATEWAY_TOKEN || !process.env.CF_ACCOUNT_ID) {
    console.error("Live mode needs AI_GATEWAY_TOKEN and CF_ACCOUNT_ID.");
    process.exit(2);
  }
  const models = { "70b": DEFAULT_MODEL, "8b": FALLBACK_MODEL };
  const model = models[arg("model", "70b")] || arg("model", "70b");
  const voice = flag("voice");
  const conversations = [];
  const lines = [`# Repetition check (live), ${new Date().toISOString()}`, "", `model: ${model}${voice ? " (voice)" : ""}`, ""];
  for (const [index, script] of SCRIPTS.entries()) {
    const session = { messages: [], messageCount: 0 };
    const replies = [];
    lines.push(`## Chat ${index + 1}`);
    for (const text of script) {
      const offers = policy.offerState(session, text);
      const extra = {};
      const options = { maxSentences: voice ? 4 : 5, dropOffers: offers.dropOffers, firstClause: voice };
      if (conv) {
        session.visitor = conv.updateVisitor(session.visitor, text);
        extra.visitor = session.visitor;
        extra.notes = conv.conversationNotes(session, text);
        Object.assign(options, { recent: conv.recentReplies(session, 3), seed: session.messageCount, askedNext: offers.asked });
      }
      const parts = [];
      try {
        for await (const part of policy.checkedSentences(streamChat({ env: process.env, messages: [...session.messages, { role: "user", text }], voice, model, offers, ...extra }), options)) {
          if (part.replace) { parts.length = 0; parts.push(part.replace); break; }
          parts.push(part.text);
        }
      } catch (error) {
        parts.push(`ERROR ${error?.reason || error?.message || error}`);
      }
      const reply = parts.join(" ");
      replies.push(reply);
      session.messages.push({ role: "user", text }, { role: "assistant", text: reply });
      session.messageCount += 1;
      lines.push(`- **Visitor:** ${text}`, `- **Chat:** ${reply}`);
      process.stdout.write(".");
    }
    conversations.push(replies);
    lines.push("");
  }
  process.stdout.write("\n");
  const totals = measure(conversations);
  const fails = liveFailures(totals);
  lines.splice(4, 0, "```", summary(totals), "```", "", fails.length ? `FAIL: ${fails.join("; ")}` : "PASS", "");
  const report = lines.join("\n");
  const out = arg("out", "");
  if (out) writeFileSync(out, report);
  console.log(summary(totals));
  console.log(fails.length ? `FAIL: ${fails.join("; ")}` : "PASS");
  return fails;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = arg("report", "");
  const fails = report ? fromReport(report) : flag("live") ? await live() : await offline();
  if (!report && !flag("live")) console.log(fails.length ? `\n${fails.length} check(s) failed.` : "\nAll offline repetition checks pass.");
  process.exit(fails.length ? 1 : 0);
}
