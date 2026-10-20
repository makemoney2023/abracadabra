// Hands-free voice call for the studio chat, run inside the session Durable Object.
//
// Browser ──PCM 16 kHz──► this call ──► Flux (Workers AI binding WebSocket, end-of-turn detection)
//                                       │ EndOfTurn transcript
//                                       ▼
//                         completeChat + postCheck (same brain and filter as typed chat)
//                                       │ reply, split into sentences
//                                       ▼
// Browser ◄──PCM 24 kHz── Aura-2 through AI Gateway, streamed chunk by chunk
//
// Barge-in: when Flux hears the visitor start a new turn while we think or speak, the current
// reply is aborted and the browser is told to drop queued audio. Audio is never stored.

import { completeChat } from "./model.js";
import { postCheck, uiActionFor } from "./policy.js";
import { rememberExchange } from "./session.js";
import {
  CALL_IDLE_MS,
  looksLikeEcho,
  MAX_CALL_MS,
  MIC_SAMPLE_RATE,
  openFlux,
  sentences,
  speakable,
  synthesizePcm,
  TTS_SAMPLE_RATE,
  VOICE_TTS_CHARS_PER_SESSION,
  VOICE_TURNS_PER_SESSION,
} from "./voice.js";

const MAX_FRAME_BYTES = 16 * 1024;
const BYTES_PER_SECOND_IN = MIC_SAMPLE_RATE * 2;
const PENDING_FRAME_CAP = 200;
const SESSION_MESSAGE_LIMIT = 30;
const PLAYBACK_GRACE_MS = 1500;

export class VoiceCall {
  /**
   * @param {object} options
   * @param {WebSocket} options.client accepted server side of the browser socket
   * @param {object} options.env worker env (AI binding, gateway settings)
   * @param {() => Promise<object|null>} options.loadSession reads the current session
   * @param {(session: object) => Promise<void>} options.saveSession writes it back
   * @param {object} [options.deps] fetchImpl, now, openFlux, timers (tests)
   */
  constructor({ client, env, loadSession, saveSession, deps = {} }) {
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
    this.closed = false;
  }

  async start() {
    try { this.client.binaryType = "arraybuffer"; } catch { /* not supported */ }
    this.client.addEventListener("message", (event) => this.onClient(event));
    this.client.addEventListener("close", () => this.end("closed", { quiet: true }));
    this.client.addEventListener("error", () => this.end("error", { quiet: true }));
    this.send({ type: "ready", sampleRate: TTS_SAMPLE_RATE, micSampleRate: MIC_SAMPLE_RATE, maxMs: MAX_CALL_MS });
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
      this.send({ type: "notice", text: "That is five minutes. Start again any time, or keep typing." });
      this.end("max_length");
      return;
    }
    if (this.state === "speaking" && this.playbackDeadline && now >= this.playbackDeadline) {
      this.finishSpeaking();
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
        if (transcript) {
          this.send({ type: "interim", text: transcript });
          if (this.state === "listening") this.lastActivity = this.now();
          this.maybeBargeIn(transcript);
        }
        break;
      case "EndOfTurn":
        if (transcript) void this.handleTurn(transcript);
        break;
      default:
        break;
    }
  }

  maybeBargeIn(transcript) {
    if (this.state !== "speaking" && this.state !== "thinking") return;
    const words = transcript.split(/\s+/).filter(Boolean);
    if (words.length < 2) return;
    if (this.state === "speaking" && looksLikeEcho(transcript, this.speakingText)) return;
    this.interrupt();
  }

  interrupt() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.speakingText = "";
    this.playbackDeadline = 0;
    this.send({ type: "interrupt", turn: this.turn });
    this.setState("listening");
  }

  async handleTurn(text) {
    if (this.controller) this.interrupt();
    const turn = ++this.turn;
    const controller = new AbortController();
    this.controller = controller;
    this.lastActivity = this.now();
    this.send({ type: "user", text, turn });
    this.setState("thinking");

    let session = await this.loadSession();
    if (!session) return this.end("session_gone");
    if ((session.voiceTurns || 0) >= VOICE_TURNS_PER_SESSION || session.messageCount >= SESSION_MESSAGE_LIMIT) {
      this.send({ type: "notice", text: "That is the voice limit for this chat. You can keep typing." });
      return this.end("turn_limit");
    }

    const draft = await completeChat({
      env: this.env,
      messages: [...session.messages, { role: "user", text }],
      fetchImpl: this.deps.fetchImpl,
      voice: true,
    });
    if (controller.signal.aborted || this.closed) return;
    const checked = postCheck(draft);
    const action = uiActionFor(text);

    session = (await this.loadSession()) || session;
    session.voiceTurns = (session.voiceTurns || 0) + 1;
    if (action === "offer_booking") session.bookingOffered = true;
    rememberExchange(session, text, checked.text, this.now(), { voice: true });
    const spoken = speakable(checked.text);
    const allowed = spoken && (session.ttsChars || 0) + spoken.length <= VOICE_TTS_CHARS_PER_SESSION;
    if (allowed) session.ttsChars = (session.ttsChars || 0) + spoken.length;
    await this.saveSession(session);
    if (controller.signal.aborted || this.closed) return;

    this.send({ type: "assistant", text: checked.text, action, turn });
    if (!allowed) {
      this.send({ type: "notice", text: "Spoken answers are used up for this chat. The answers stay in the chat." });
      this.controller = null;
      return this.end("tts_limit");
    }
    await this.speak(spoken, turn, controller);
  }

  async speak(text, turn, controller) {
    this.speakingText = text;
    this.setState("speaking");
    const parts = sentences(text);
    // Start every sentence at once so the next one is ready when the first ends; play in order.
    const bodies = parts.map((part) => synthesizePcm({
      env: this.env,
      text: part,
      signal: controller.signal,
      fetchImpl: this.deps.fetchImpl,
    }));
    this.send({ type: "audio_start", turn, sampleRate: TTS_SAMPLE_RATE });
    let carry = null;
    let sentBytes = 0;
    let firstByteAt = 0;
    this.playbackDeadline = 0;
    for (const pending of bodies) {
      const body = await pending;
      if (!body) continue;
      const reader = body.getReader();
      // A barge-in must stop a read that is still waiting on Aura, not only the next one.
      const stop = () => reader.cancel().catch(() => {});
      controller.signal.addEventListener("abort", stop, { once: true });
      while (true) {
        if (controller.signal.aborted || this.closed) {
          try { await reader.cancel(); } catch { /* stream already closed */ }
          for (const rest of bodies) rest.then((other) => other?.cancel?.().catch(() => {})).catch(() => {});
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
          if (!firstByteAt) firstByteAt = this.now();
          sentBytes += bytes.length;
        }
      }
    }
    if (controller.signal.aborted || this.closed) return;
    this.send({ type: "audio_end", turn });
    // The browser is still playing what it queued. Stay "speaking" (so barge-in keeps working)
    // until it says the audio finished, or until that audio must have ended.
    const playMs = (sentBytes / 2 / TTS_SAMPLE_RATE) * 1000;
    this.playbackDeadline = this.now() + Math.max(0, playMs - (this.now() - firstByteAt)) + PLAYBACK_GRACE_MS;
  }

  finishSpeaking(turn) {
    if (this.closed || this.state !== "speaking" || (turn !== undefined && turn !== this.turn)) return;
    this.controller = null;
    this.speakingText = "";
    this.playbackDeadline = 0;
    this.lastActivity = this.now();
    this.setState("listening");
  }

  end(reason, { quiet = false } = {}) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
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
    this.deps.onEnd?.(reason);
  }
}
