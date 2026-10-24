// Hands-free voice call for the studio chat, run inside the session Durable Object.
//
// Browser ──PCM 16 kHz──► this call ──► Flux (Workers AI binding WebSocket, end-of-turn detection)
//                                       │ EndOfTurn transcript
//                                       ▼
//                         streamChat + checkedSentences (same brain and filter as typed chat)
//                                       │ each checked sentence goes to Aura as soon as it is written
//                                       ▼
// Browser ◄──PCM 24 kHz── Aura-2 through AI Gateway, streamed chunk by chunk
//
// Filler: if nothing is audible FILLER_AFTER_MS after the turn ends, the browser plays one short
// pre-generated line ("Let me check.") from /assets/voice/, and the answer queues after it. Never on
// two turns in a row, only lines whose audio is built in the call's own voice (fillerReady).
//
// Barge-in: when Flux hears the visitor start a new turn while we think or speak, the current
// reply is aborted and the browser is told to drop queued audio. Audio is never stored.

import { ChatUnavailable, replyStream } from "./model.js";
import { checkedSentences, hasOffer, localReply, offerState, uiActionFor } from "./policy.js";
import { conversationNotes, noteOffer, recentReplies, updateVisitor } from "./conversation.js";
import { chatHistory, rememberExchange } from "./session.js";
import { auditIntent, AUDITS_PER_SESSION, checkHost } from "./audit.js";
import { cardsFor, RECAP_REPLY } from "./cards.js";
import { DEMO_ASK, DEMO_LINES, DEMO_MS, DEMO_TURNS, demoExpired, demoIntent, demoOpening, demoPrompt, demoTakeaway, onDemoPage, DEMO_OFFER_NOTE } from "./demo.js";
import { flag } from "./flags.js";
import { recapCard, recapIntent } from "./recap.js";
import {
  BARGE_IN_HOLD_MS,
  BARGE_IN_SHORT_WORDS,
  BARGE_IN_WORDS,
  CALL_IDLE_MS,
  callSpeaker,
  FILLER_AFTER_MS,
  fillerReady,
  FILLERS,
  looksLikeEcho,
  MAX_CALL_MS,
  MIC_SAMPLE_RATE,
  openFlux,
  speakable,
  synthesizePcm,
  TTS_CHAR_CAP,
  TTS_SAMPLE_RATE,
  VOICE_TTS_CHARS_PER_SESSION,
  VOICE_TURNS_PER_SESSION,
} from "./voice.js";

const MAX_FRAME_BYTES = 16 * 1024;
const BYTES_PER_SECOND_IN = MIC_SAMPLE_RATE * 2;
const PENDING_FRAME_CAP = 200;
const SESSION_MESSAGE_LIMIT = 30;
const PLAYBACK_GRACE_MS = 1500;
const FILLER_MS = 1200;
// Voice answers are about 35 words: three sentences (plus the first clause piece).
const VOICE_SENTENCES = 3;
export const VOICE_RETRY_TEXT = "Sorry, I lost that one. Could you say it again?";

/** What the voice says when it opens the calendar (or the two-times form when no Cal.com link is set). */
export function bookingLine(env) {
  return String(env?.CAL_LINK || env?.BOOKING_URL || "").trim()
    ? "I've opened the booking calendar right here in the chat. Pick a thirty-minute time that works, and I'm still listening if you have questions."
    : "I've opened a short form in the chat. Leave your email and two times that work, and a person will send the invite.";
}

/** "acme.ca" read aloud: "acme dot ca". */
export function spokenHost(host) {
  return String(host || "").replace(/\./g, " dot ");
}

/**
 * A voice turn answered with a fixed line, or a receptionist-demo turn. Returns
 * { text, cards?, demo?: "on" | "off" | "turn" } or null for a normal turn.
 */
export function voiceMode(session, env, text, visitor, now) {
  const demo = session.demo;
  if (demo?.active) {
    const stop = demoIntent(text) === "stop";
    if (stop || demoExpired(demo, now)) return { text: demoTakeaway(visitor, stop ? "stop" : "time"), demo: "off" };
    return { demo: "turn" };
  }
  if (flag(env, "RECEPTIONIST_DEMO") && onDemoPage(session.page) && demoIntent(text) === "start" && (demo?.runs || 0) < 2) {
    return { text: demoOpening(visitor), demo: "on" };
  }
  if (flag(env, "CHAT_AUDIT")) {
    const site = auditIntent(text);
    if (site) {
      const checked = checkHost(site);
      if (!checked.ok) return { text: "I can only scan a public website address, like yourcompany dot com." };
      if ((session.audits || []).length >= AUDITS_PER_SESSION && !(session.audits || []).some((a) => a.host === checked.host)) {
        return { text: "That's the two scans this chat can run. The Schema scanner page runs more." };
      }
      return {
        text: `I can scan ${spokenHost(checked.host)} for how easily AI search reads it. Tap Run the scan in the chat to start it.`,
        cards: [{ kind: "audit_offer", host: checked.host }],
      };
    }
  }
  if (flag(env, "CHAT_RECAP_CARD") && recapIntent(text) && recapCard({ ...session, visitor })) return { text: RECAP_REPLY };
  return null;
}

/** Words only, lower case: "What do you build?" and "what do you build" are the same turn. */
export function sameWords(text) {
  return (String(text || "").toLowerCase().match(/[a-z0-9']+/g) || []).join(" ");
}

/** Reads a reply stream into memory as it arrives, so it can be replayed once the turn is final. */
class Prefetch {
  constructor(key, stream, controller, startedAt) {
    this.key = key;
    this.controller = controller;
    this.startedAt = startedAt;
    this.parts = [];
    this.done = false;
    this.error = null;
    this.wake = null;
    (async () => {
      try {
        for await (const delta of stream) {
          this.parts.push(delta);
          this.wake?.();
        }
      } catch (error) {
        this.error = error;
      }
      this.done = true;
      this.wake?.();
    })();
  }
  abort() {
    this.controller.abort();
  }
  async *replay(signal) {
    const stop = () => this.controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    let index = 0;
    while (true) {
      if (index < this.parts.length) {
        yield this.parts[index++];
        continue;
      }
      if (this.error) throw this.error;
      if (this.done) return;
      await new Promise((resolve) => { this.wake = resolve; });
      this.wake = null;
    }
  }
}

/** A small async queue: push() as items arrive, iterate in order, close() when done. */
class Channel {
  constructor() {
    this.items = [];
    this.waiting = null;
    this.done = false;
  }
  push(item) {
    this.items.push(item);
    this.waiting?.();
  }
  close() {
    this.done = true;
    this.waiting?.();
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.items.length) {
        yield this.items.shift();
        continue;
      }
      if (this.done) return;
      await new Promise((resolve) => { this.waiting = resolve; });
      this.waiting = null;
    }
  }
}

export class VoiceCall {
  /**
   * @param {object} options
   * @param {WebSocket} options.client accepted server side of the browser socket
   * @param {object} options.env worker env (AI binding, gateway settings)
   * @param {() => Promise<object|null>} options.loadSession reads the current session
   * @param {(session: object) => Promise<void>} options.saveSession writes it back
   * @param {object} [options.deps] fetchImpl, now, openFlux, timers (tests)
   */
  constructor({ client, env, loadSession, saveSession, deps = {}, sessionId = "" }) {
    this.client = client;
    this.env = env;
    this.loadSession = loadSession;
    this.saveSession = saveSession;
    this.deps = deps;
    this.now = deps.now || (() => Date.now());
    this.startedAt = this.now();
    this.lastActivity = this.startedAt;
    this.bytesIn = 0;
    this.pending = [];
    this.flux = null;
    this.state = "connecting";
    this.turn = 0;
    this.controller = null;
    this.speakingText = "";
    this.fillerText = "";
    this.fillerCount = 0;
    this.lastFillerTurn = -1;
    this.bargeSince = 0;
    // One Aura-2 voice per chat (TTS_SPEAKER, or the TTS_SPEAKER_AB test). Logged so results can be compared.
    const voice = callSpeaker(env, sessionId);
    this.speaker = voice.speaker;
    this.speakerAb = voice.ab;
    this.closed = false;
  }

  async start() {
    try { this.client.binaryType = "arraybuffer"; } catch { /* not supported */ }
    this.client.addEventListener("message", (event) => this.onClient(event));
    this.client.addEventListener("close", () => this.end("closed", { quiet: true }));
    this.client.addEventListener("error", () => this.end("error", { quiet: true }));
    this.send({ type: "ready", sampleRate: TTS_SAMPLE_RATE, micSampleRate: MIC_SAMPLE_RATE, maxMs: MAX_CALL_MS, voice: this.speaker });
    console.log(`voice call: speaker=${this.speaker}${this.speakerAb ? " (a/b)" : ""}`);
    const open = this.deps.openFlux || openFlux;
    const flux = await open(this.env);
    if (this.closed) {
      try { flux?.close(); } catch { /* already closed */ }
      return;
    }
    if (!flux) {
      this.send({ type: "notice", text: "The voice line is quiet right now. You can keep typing." });
      this.end("stt_unavailable");
      return;
    }
    this.flux = flux;
    flux.addEventListener("message", (event) => this.onFlux(event));
    flux.addEventListener("close", () => this.end("stt_closed"));
    flux.addEventListener("error", () => this.end("stt_error"));
    for (const frame of this.pending) flux.send(frame);
    this.pending = [];
    this.setState("listening");
    const every = this.deps.tickMs ?? 1000;
    if (every > 0) this.timer = setInterval(() => this.tick(), every);
  }

  send(message) {
    if (this.closed && message.type !== "end") return;
    try {
      this.client.send(JSON.stringify(message));
    } catch {
      // The browser went away; close() will follow.
    }
  }

  setState(state) {
    this.state = state;
    this.send({ type: "state", state });
  }

  tick() {
    const now = this.now();
    if (now - this.startedAt >= MAX_CALL_MS) {
      this.send({ type: "notice", text: `That is ${Math.round(MAX_CALL_MS / 60000)} minutes. Start again any time, or keep typing.` });
      this.end("max_length");
      return;
    }
    if (this.state === "speaking" && this.playbackDeadline && now >= this.playbackDeadline) {
      this.finishSpeaking();
    }
    if (this.demoUntil && now >= this.demoUntil && this.state === "listening") {
      this.demoUntil = 0;
      void this.finishDemo();
      return;
    }
    if (this.state === "listening" && now - this.lastActivity >= CALL_IDLE_MS) {
      this.send({ type: "notice", text: "I ended the call because it went quiet." });
      this.end("idle");
    }
  }

  onClient(event) {
    if (this.closed) return;
    const data = event.data;
    if (typeof data === "string") {
      let message;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (message?.type === "end") this.end("visitor");
      else if (message?.type === "played") this.finishSpeaking(Number(message.turn));
      else if (message?.type === "booked") void this.sayBooked(message.when);
      return;
    }
    // Newer runtimes hand binary frames over as Blob. Read them in order.
    if (data && typeof data.byteLength !== "number" && typeof data.arrayBuffer === "function") {
      if ((data.size || 0) > MAX_FRAME_BYTES) return;
      this.inbox = (this.inbox || Promise.resolve())
        .then(() => data.arrayBuffer())
        .then((buffer) => this.onAudio(buffer))
        .catch(() => {});
      return;
    }
    this.onAudio(data);
  }

  onAudio(data) {
    if (this.closed) return;
    const bytes = data?.byteLength || 0;
    if (!bytes || bytes > MAX_FRAME_BYTES) return;
    this.bytesIn += bytes;
    // Mic audio arrives in real time. A sender far ahead of the clock is not a microphone.
    const elapsed = (this.now() - this.startedAt) / 1000;
    if (this.bytesIn > (elapsed + 5) * BYTES_PER_SECOND_IN * 1.5) {
      this.end("rate");
      return;
    }
    if (this.flux) this.flux.send(data);
    else if (this.pending.length < PENDING_FRAME_CAP) this.pending.push(data);
  }

  onFlux(event) {
    if (this.closed || typeof event.data !== "string") return;
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    const transcript = String(data?.transcript || "").trim();
    switch (data?.event) {
      case "StartOfTurn":
      case "Update":
      case "TurnResumed":
        if (data.event === "TurnResumed") this.dropEager();
        if (transcript) {
          this.send({ type: "interim", text: transcript });
          if (this.state === "listening") this.lastActivity = this.now();
          this.maybeBargeIn(transcript);
        }
        break;
      case "EagerEndOfTurn":
        if (transcript) void this.startEager(transcript);
        break;
      case "EndOfTurn":
        if (transcript) void this.handleTurn(transcript);
        break;
      default:
        break;
    }
  }

  /**
   * Barge-in: BARGE_IN_WORDS new words stop the reply at once. BARGE_IN_SHORT_WORDS stop it only if
   * they are still there BARGE_IN_HOLD_MS later (a cough or "mm-hm" does not). Echo never counts.
   */
  maybeBargeIn(transcript) {
    if (this.state !== "speaking" && this.state !== "thinking") return this.clearBarge();
    const words = transcript.split(/\s+/).filter(Boolean);
    if (words.length < BARGE_IN_SHORT_WORDS) return this.clearBarge();
    if (this.state === "speaking" && looksLikeEcho(transcript, `${this.fillerText} ${this.speakingText}`)) return this.clearBarge();
    if (this.state === "thinking" && this.fillerText && looksLikeEcho(transcript, this.fillerText)) return this.clearBarge();
    if (words.length >= BARGE_IN_WORDS) {
      this.clearBarge();
      return this.interrupt();
    }
    const hold = this.deps.bargeHoldMs ?? BARGE_IN_HOLD_MS;
    if (!this.bargeSince) {
      this.bargeSince = this.now();
      const turn = this.turn;
      clearTimeout(this.bargeTimer);
      this.bargeTimer = setTimeout(() => {
        if (this.closed || !this.bargeSince || turn !== this.turn) return;
        if (this.state !== "speaking" && this.state !== "thinking") return this.clearBarge();
        this.clearBarge();
        this.interrupt();
      }, hold);
      return;
    }
    if (this.now() - this.bargeSince >= hold) {
      this.clearBarge();
      this.interrupt();
    }
  }

  clearBarge() {
    this.bargeSince = 0;
    clearTimeout(this.bargeTimer);
  }

  interrupt() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.speakingText = "";
    this.fillerText = "";
    this.playbackDeadline = 0;
    this.send({ type: "interrupt", turn: this.turn });
    this.setState("listening");
  }

  async handleTurn(text) {
    this.clearBarge();
    if (this.controller) this.interrupt();
    const turn = ++this.turn;
    const controller = new AbortController();
    this.controller = controller;
    this.lastActivity = this.now();
    // Demo turns are role-play: the widget keeps them out of booking notes.
    this.send({ type: "user", text, turn, ...(this.demoTurns ? { demo: true } : {}) });
    this.setState("thinking");

    let session = await this.loadSession();
    if (!session) return this.end("session_gone");
    if ((session.voiceTurns || 0) >= VOICE_TURNS_PER_SESSION || session.messageCount >= SESSION_MESSAGE_LIMIT) {
      this.send({ type: "notice", text: "That is the voice limit for this chat. You can keep typing." });
      return this.end("turn_limit");
    }

    let action = uiActionFor(text);
    const offers = offerState(session, text);
    // Same visitor memory and turn notes as typed chat, so voice does not re-ask either.
    const visitor = session.demo?.active ? { ...(session.visitor || {}) } : updateVisitor(session.visitor, text);
    const mode = voiceMode(session, this.env, text, visitor, this.now());
    const inDemo = mode?.demo === "turn";
    // The demo never opens the real calendar or the contact card.
    if (mode) action = null;
    let notes = conversationNotes({ ...session, visitor }, text, visitor);
    if (!mode && flag(this.env, "RECEPTIONIST_DEMO") && onDemoPage(session.page) && !session.demo && !session.demoOffered) notes = [notes, DEMO_OFFER_NOTE].filter(Boolean).join("\n");
    const recent = recentReplies(session, 3);
    const seed = session.messageCount || 0;
    const budget = VOICE_TTS_CHARS_PER_SESSION - (session.ttsChars || 0);
    if (budget <= 0) return this.ttsLimit();
    // A clear ask to book: open the calendar now and say so, without waiting on the model.
    const booking = action === "open_booking" ? bookingLine(this.env) : mode?.text || "";
    if (booking || inDemo) this.dropEager();
    if (action === "open_booking") this.send({ type: "ui_action", action, turn });
    if (mode?.demo === "on") this.send({ type: "demo", state: "on", ms: DEMO_MS, turn });
    if (mode?.demo === "off") this.send({ type: "demo", state: "off", turn });
    // The receptionist role-play: its own prompt, only the demo turns as history. Those turns live only
    // in this call's memory (this.demoTurns), never in the session, so nothing the caller says in the
    // role (a date of birth, a symptom, a card number) is stored, recapped or sent to HQ.
    const demoHistory = inDemo ? this.demoTurns || [] : null;
    const audio = new Channel();
    this.firstAudioAt = 0;
    this.fillerText = "";
    this.filler = setTimeout(() => this.playFiller(turn, controller), this.deps.fillerAfterMs ?? FILLER_AFTER_MS);
    const playing = this.speak(audio, turn, controller);

    let answer = "";
    let spokenChars = 0;
    let failure = null;
    const queueSpeech = (sentence) => {
      const spoken = speakable(sentence);
      // Whole sentences only, inside the per-reply and per-session spoken caps.
      if (!spoken || spokenChars + spoken.length > Math.min(budget, TTS_CHAR_CAP)) return false;
      spokenChars += spoken.length;
      this.speakingText = `${this.speakingText} ${spoken}`.trim();
      // Start Aura for this sentence now; the player keeps the order.
      audio.push(synthesizePcm({ env: this.env, text: spoken, signal: controller.signal, fetchImpl: this.deps.fetchImpl, speaker: this.speaker }));
      return true;
    };
    this.speakingText = "";
    try {
      const eager = booking || inDemo ? null : this.takeEager(text);
      const deltas = booking
        ? (async function* () { yield booking; })()
        : eager
        ? eager.replay(controller.signal)
        : inDemo
        ? replyStream({ env: this.env, messages: [...demoHistory, { role: "user", text }], fetchImpl: this.deps.fetchImpl, voice: true, signal: controller.signal, system: demoPrompt(visitor) })
        : replyStream({ env: this.env, messages: [...chatHistory(session.messages), { role: "user", text }], fetchImpl: this.deps.fetchImpl, voice: true, signal: controller.signal, page: { path: session.page, title: session.pageTitle }, offers, visitor, notes });
      const rules = inDemo
        ? { maxSentences: VOICE_SENTENCES + 1, firstClause: true, dropAsk: DEMO_ASK, emptyLines: DEMO_LINES, seed }
        : { maxSentences: booking ? 8 : VOICE_SENTENCES + 1, firstClause: true, dropOffers: !booking && offers.dropOffers, recent: booking ? [] : recent, seed, askedNext: offers.asked };
      for await (const part of checkedSentences(deltas, rules)) {
        if (controller.signal.aborted || this.closed) break;
        if (part.replace) {
          // Nothing unsafe is ever spoken. If a sentence already played, stop there. In the demo a
          // replaced answer (a price, a claim) becomes a neutral line in the role.
          if (!answer) {
            if (inDemo) part.replace = DEMO_LINES[seed % DEMO_LINES.length];
            answer = part.replace;
            queueSpeech(part.replace);
          }
          break;
        }
        answer = answer ? `${answer} ${part.text}` : part.text;
        if (!queueSpeech(part.text)) break;
      }
    } catch (error) {
      failure = error instanceof ChatUnavailable ? error.reason : "error";
    }
    if (controller.signal.aborted || this.closed) {
      audio.close();
      return;
    }
    if (!answer) {
      answer = failure === "unconfigured" ? localReply(text, { seed, recent }) : VOICE_RETRY_TEXT;
      if (failure && failure !== "unconfigured") console.error(`voice reply: ${failure}`);
      queueSpeech(answer);
    }
    audio.close();
    const outOfVoice = spokenChars === 0;

    session = (await this.loadSession()) || session;
    session.voiceTurns = (session.voiceTurns || 0) + 1;
    session.voiceSpeaker = this.speaker;
    // Role-play words never update the visitor record.
    if (!inDemo) session.visitor = noteOffer(updateVisitor(session.visitor, text), answer !== VOICE_RETRY_TEXT && hasOffer(answer), session.messageCount);
    if (action === "offer_booking" || action === "open_booking") session.bookingOffered = true;
    // The demo is offered once: after a reply mentions it, the note goes away.
    if (!mode && /\bdemo\b/i.test(answer)) session.demoOffered = true;
    const at = this.now();
    if (mode?.demo === "on") {
      session.demo = { active: true, startedAt: at, turns: 0, runs: (session.demo?.runs || 0) + 1 };
      this.demoUntil = at + DEMO_MS;
      this.demoTurns = [{ role: "user", text }, { role: "assistant", text: answer }];
    } else if (inDemo) {
      session.demo = { ...session.demo, turns: (session.demo.turns || 0) + 1 };
      this.demoTurns = [...(this.demoTurns || []), { role: "user", text }, { role: "assistant", text: answer }].slice(-2 * (DEMO_TURNS + 1));
    } else if (mode?.demo === "off") {
      session.demo = { ...session.demo, active: false, done: true, endedAt: at };
      this.demoUntil = 0;
      this.demoTurns = null;
    }
    const demoTurn = mode?.demo === "on" || inDemo;
    if (inDemo) {
      // Counted against the chat's caps, but the words are not kept.
      session.messageCount += 1;
      session.updatedAt = at;
    } else if (answer !== VOICE_RETRY_TEXT) rememberExchange(session, text, answer, at, { voice: true, demo: demoTurn });
    else session.replyFailures = (session.replyFailures || 0) + 1;
    // Cards (mini-audit offer, recap, case-study film) show in the chat; none during the role-play.
    const cards = demoTurn ? [] : [...(mode?.cards || []), ...cardsFor(session, this.env, text, mode ? "" : answer)];
    session.ttsChars = (session.ttsChars || 0) + spokenChars;
    await this.saveSession(session);
    if (controller.signal.aborted || this.closed) return;
    // The calendar already opened at the start of this turn.
    if (action === "open_booking") action = null;
    this.send({ type: "assistant", text: answer, action, turn, ...(demoTurn ? { demo: true } : {}) });
    for (const card of cards) this.send({ type: "card", card, turn });
    if (outOfVoice) return this.ttsLimit();
    await playing;
  }

  /** The demo's two minutes ran out while the visitor was quiet: close it out loud. */
  async finishDemo() {
    const session = await this.loadSession();
    if (!session || this.closed || !session.demo?.active) return;
    session.demo = { ...session.demo, active: false, done: true, endedAt: this.now() };
    this.demoTurns = null;
    await this.saveSession(session);
    this.send({ type: "demo", state: "off" });
    await this.say(demoTakeaway(session.visitor, "time"));
  }

  /**
   * Flux thinks the visitor is probably done: start the model now, quietly. Nothing is shown or
   * spoken until EndOfTurn; a different final transcript or TurnResumed throws this away.
   */
  async startEager(text) {
    if (this.closed || this.state !== "listening") return;
    this.dropEager();
    const ticket = (this.eagerTicket = (this.eagerTicket || 0) + 1);
    const session = await this.loadSession();
    // EndOfTurn may have arrived while the session loaded; then this guess is too late.
    if (ticket !== this.eagerTicket || !session || this.closed || (session.voiceTurns || 0) >= VOICE_TURNS_PER_SESSION) return;
    // Demo turns, fixed lines and demo starts never use the guess.
    if (session.demo?.active || voiceMode(session, this.env, text, session.visitor, this.now())) return;
    const controller = new AbortController();
    // Same prompt as handleTurn builds for this text, so a reused guess matches the real turn.
    const visitor = updateVisitor(session.visitor, text);
    const notes = conversationNotes({ ...session, visitor }, text, visitor);
    const notesFor = !session.demo && !session.demoOffered && flag(this.env, "RECEPTIONIST_DEMO") && onDemoPage(session.page) ? [notes, DEMO_OFFER_NOTE].filter(Boolean).join("\n") : notes;
    const stream = replyStream({ env: this.env, messages: [...chatHistory(session.messages), { role: "user", text }], fetchImpl: this.deps.fetchImpl, voice: true, signal: controller.signal, page: { path: session.page, title: session.pageTitle }, offers: offerState(session, text), visitor, notes: notesFor });
    this.eager = new Prefetch(sameWords(text), stream, controller, this.now());
    this.eagerStarts = (this.eagerStarts || 0) + 1;
  }

  takeEager(text) {
    this.eagerTicket = (this.eagerTicket || 0) + 1;
    const eager = this.eager;
    this.eager = null;
    if (!eager) return null;
    if (eager.key !== sameWords(text)) {
      eager.abort();
      return null;
    }
    this.eagerHits = (this.eagerHits || 0) + 1;
    console.log(`voice eager reuse: model started ${this.now() - eager.startedAt}ms before end of turn`);
    return eager;
  }

  dropEager() {
    this.eager?.abort();
    this.eager = null;
  }

  /** The visitor finished booking on screen during the call: confirm it out loud, once. */
  async sayBooked(when) {
    if (this.closed || this.bookedSaid) return;
    this.bookedSaid = true;
    const label = String(when || "").replace(/[^\w :,.\-]/g, "").trim().slice(0, 60);
    const line = label
      ? `You're booked for ${label}. A calendar invite is on its way to your email.`
      : "You're booked. A calendar invite is on its way to your email.";
    await this.say(line);
  }

  /** Speaks one fixed line as its own turn (no model), inside the spoken caps. */
  async say(line) {
    if (this.controller) this.interrupt();
    const turn = ++this.turn;
    const controller = new AbortController();
    this.controller = controller;
    this.lastActivity = this.now();
    const session = await this.loadSession();
    if (!session || this.closed || controller.signal.aborted) return;
    const spoken = speakable(line);
    const budget = VOICE_TTS_CHARS_PER_SESSION - (session.ttsChars || 0);
    this.send({ type: "assistant", text: line, turn });
    if (!spoken || spoken.length > budget) {
      this.controller = null;
      return;
    }
    this.setState("thinking");
    const audio = new Channel();
    this.firstAudioAt = 0;
    this.fillerText = "";
    this.speakingText = spoken;
    const playing = this.speak(audio, turn, controller);
    audio.push(synthesizePcm({ env: this.env, text: spoken, signal: controller.signal, fetchImpl: this.deps.fetchImpl, speaker: this.speaker }));
    audio.close();
    session.ttsChars = (session.ttsChars || 0) + spoken.length;
    await this.saveSession(session);
    await playing;
  }

  ttsLimit() {
    this.send({ type: "notice", text: "Spoken answers are used up for this chat. The answers stay in the chat." });
    this.controller = null;
    return this.end("tts_limit");
  }

  /** Tells the browser to play one cached filler line if the answer is not audible yet. */
  playFiller(turn, controller) {
    if (this.closed || controller.signal.aborted || turn !== this.turn || this.firstAudioAt) return;
    // Never two turns in a row, and only lines built in this call's own voice.
    const ready = fillerReady(this.speaker);
    if (this.lastFillerTurn === turn - 1 || !ready.length) return;
    this.lastFillerTurn = turn;
    const index = ready[this.fillerCount++ % ready.length];
    this.fillerText = FILLERS[index];
    this.fillerUntil = this.now() + FILLER_MS;
    this.send({ type: "filler", index, turn, voice: this.speaker });
  }

  /** Plays Aura bodies in order as they arrive on the channel. */
  async speak(audio, turn, controller) {
    let carry = null;
    let sentBytes = 0;
    let started = false;
    this.playbackDeadline = 0;
    for await (const pending of audio) {
      const body = await pending;
      if (!body) continue;
      if (!started) {
        started = true;
        this.setState("speaking");
        this.send({ type: "audio_start", turn, sampleRate: TTS_SAMPLE_RATE });
      }
      const reader = body.getReader();
      // A barge-in must stop a read that is still waiting on Aura, not only the next one.
      const stop = () => reader.cancel().catch(() => {});
      controller.signal.addEventListener("abort", stop, { once: true });
      while (true) {
        if (controller.signal.aborted || this.closed) {
          try { await reader.cancel(); } catch { /* stream already closed */ }
          for (const rest of audio.items) Promise.resolve(rest).then((other) => other?.cancel?.().catch(() => {})).catch(() => {});
          clearTimeout(this.filler);
          return;
        }
        let chunk;
        try {
          chunk = await reader.read();
        } catch {
          break;
        }
        if (chunk.done) {
          controller.signal.removeEventListener("abort", stop);
          break;
        }
        let bytes = chunk.value instanceof Uint8Array ? chunk.value : new Uint8Array(chunk.value);
        if (carry) {
          const joined = new Uint8Array(carry.length + bytes.length);
          joined.set(carry);
          joined.set(bytes, carry.length);
          bytes = joined;
          carry = null;
        }
        // Keep 16-bit samples whole across chunks.
        if (bytes.length % 2) {
          carry = bytes.slice(bytes.length - 1);
          bytes = bytes.subarray(0, bytes.length - 1);
        }
        if (bytes.length) {
          try {
            this.client.send(bytes);
          } catch {
            return;
          }
          if (!this.firstAudioAt) {
            this.firstAudioAt = this.now();
            clearTimeout(this.filler);
          }
          sentBytes += bytes.length;
        }
      }
    }
    clearTimeout(this.filler);
    if (controller.signal.aborted || this.closed || !started) {
      if (!started && !controller.signal.aborted && !this.closed && turn === this.turn) {
        this.controller = null;
        this.setState("listening");
      }
      return;
    }
    this.send({ type: "audio_end", turn });
    // The browser is still playing what it queued (after any filler). Stay "speaking" (so barge-in
    // keeps working) until it says the audio finished, or until that audio must have ended.
    const playMs = (sentBytes / 2 / TTS_SAMPLE_RATE) * 1000;
    const fillerLeft = Math.max(0, (this.fillerUntil || 0) - this.firstAudioAt);
    this.playbackDeadline = this.now() + Math.max(0, playMs + fillerLeft - (this.now() - this.firstAudioAt)) + PLAYBACK_GRACE_MS;
  }

  finishSpeaking(turn) {
    if (this.closed || this.state !== "speaking" || (turn !== undefined && turn !== this.turn)) return;
    this.clearBarge();
    this.controller = null;
    this.speakingText = "";
    this.fillerText = "";
    this.playbackDeadline = 0;
    this.lastActivity = this.now();
    this.setState("listening");
  }

  end(reason, { quiet = false } = {}) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.filler);
    this.clearBarge();
    this.dropEager();
    this.controller?.abort();
    this.controller = null;
    this.pending = [];
    if (!quiet) {
      try {
        this.client.send(JSON.stringify({ type: "end", reason }));
      } catch { /* gone */ }
    }
    try {
      this.flux?.send(JSON.stringify({ type: "CloseStream" }));
    } catch { /* gone */ }
    try { this.flux?.close(); } catch { /* gone */ }
    try { this.client.close(1000, reason.slice(0, 60)); } catch { /* gone */ }
    // A demo never outlives its call: the next call starts in normal mode.
    if (this.demoTurns) {
      this.demoTurns = null;
      void (async () => {
        const session = await this.loadSession();
        if (session?.demo?.active) {
          session.demo = { ...session.demo, active: false, done: true, endedAt: this.now() };
          await this.saveSession(session);
        }
      })().catch(() => {});
    }
    this.deps.onEnd?.(reason);
  }
}
