# abracadabra-chat

The studio chat for `abra-ca-dabra.app`. The page widget lives in `scrollcraft/builds/abracadabra-ai/assets/chat-widget.js`. This Worker answers `/api/chat/*`. The marketing Worker proxies those paths with a service binding named `CHAT`, so the browser stays on the apex.

A chat does not email the visitor. A consented contact card, or a booking finished inside the panel, is stored on the session Durable Object and mailed to `houdini@abra-ca-dabra.app`. Christopher reviews that note before anyone writes back.

## Routes

| Method | Path | What it does |
|---|---|---|
| GET | `/api/chat/config` | Public `calLink`, readiness check URL, Turnstile site key, greeting |
| POST | `/api/chat/session` | Checks Turnstile, opens a session, sets an HttpOnly cookie |
| POST | `/api/chat/message` | Answers in a short server-sent stream and may attach a card |
| POST | `/api/chat/contact` | Saves name, email, goal, and consent. Consent must be true |
| POST | `/api/chat/events` | `booking_opened`, `booking_completed`, `readiness_check_clicked` |
| GET (WebSocket) | `/api/chat/realtime` | Hands-free voice call. Mic PCM in, JSON events and Aura-2 PCM out. See Voice below |

Cards:

- **Book** opens Cal.com in the panel when `CAL_LINK` or `BOOKING_URL` is set. The frame is prefilled with name, email, notes, and `metadata[chat_session_id]`. An empty link shows a two-times form instead.
- **Readiness** links to `https://check.abra-ca-dabra.app/check` with `utm_source=chat`.
- **Contact** is the only path that asks for an email. The checkbox is required.

Answers pass through a fixed check before they are shown: no prices, no start-date promises, no jargon, no off-site links, and at most three sentences. The model call, when configured, goes to Cloudflare AI Gateway `abracadabra-chat` with cache and payload logging off. If the gateway is unset or down, the Worker uses the same short studio lines.

Sessions live for 30 days. After 15 idle minutes, a session that has a contact or a booking and has not yet mailed houdini@ is mailed once.

## Configure

Copy `.dev.vars.example` to `.dev.vars` (do not commit it). On the Worker, set the same names as secrets or vars.

| Name | Role |
|---|---|
| `CAL_LINK` | Cal.com path, such as `abracadabra/working-session`. Empty shows the two-times card |
| `BOOKING_URL` | Same link, if you already use the HQ name |
| `READINESS_CHECK_URL` | Defaults to the check app |
| `TURNSTILE_SITE_KEY` | Shown to the widget. Empty skips the widget challenge |
| `TURNSTILE_SECRET_KEY` | Required for `https://abra-ca-dabra.app`. Localhost may open without it |
| `AI_GATEWAY_ID` | Defaults to `abracadabra-chat` |
| `AI_GATEWAY_TOKEN` | Cloudflare token that can call AI Gateway |
| `CF_ACCOUNT_ID` | Account that owns the gateway |
| `AI_MODEL` | Typed chat model. Defaults to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `AI_VOICE_MODEL` | Voice model; falls back to `AI_MODEL`, then the default |
| `AI_FALLBACK_MODEL` | One retry when the main model errors, garbles or is silent for 6 s. Default `@cf/meta/llama-3.1-8b-instruct-fast`; `none` turns it off |
| `HANDOFF_HMAC_SECRET` | Signs the `abra.chat.handoff` v1.0 JSON in the houdini@ mail |
| `CHAT_HANDOFF_TO` | Must include `houdini@abra-ca-dabra.app`. Anything else is ignored |
| `CHAT_ORIGINS` | Extra allowed `Origin` values, comma-separated |
| `AI` (binding) | Workers AI binding in `wrangler.jsonc`. Flux speech-to-text runs over its WebSocket. No token |
| `VOICE_ENABLED` | `"true"` shows the mic (set in `wrangler.jsonc`). `"false"` turns voice off |
| `TTS_SPEAKER` | Aura-2 voice, default `luna`. Unknown names fall back to `luna` |
| `TTS_MODEL` | Optional. Default `@cf/deepgram/aura-2-en` |

## Leads into HQ

When a visitor saves the consented note card (name, email, what they need, times), the worker posts one lead to HQ's
`POST {HANDOFF_INTAKE_ORIGIN}/api/intake/project-inquiry`, signed like the /start/ form
(`x-intake-signature` = HMAC-SHA256 hex of the body with `PROJECT_INQUIRY_SIGNING_SECRET`, `x-intake-timestamp` = ms).
HQ opens or reuses a deal, logs a `project_inquiry` activity and marks it `reply_needed`; the inbound routine hands it
to Sales Outbound. `external_id` is `chat_<session id>`, so retries (idle alarm, up to 5) never make a second lead.
`need` is "Website chat"; `message` starts "From the website chat" and carries the note and the latest transcript.
Nothing is emailed to the visitor. Both settings empty = no post (the houdini@ handoff mail still works as before).

## Streaming and the working indicator

Typed replies stream from the gateway (`stream: true`) and are checked one sentence at a time (`checkedSentences`):
each sentence that passes is sent as an SSE `token`, then `final` carries the whole checked answer. A sentence that
trips the price, promise, jargon or "no portfolio" rules replaces the whole answer. If the model fails, the stream
sends `error` (a short retry line) instead of hanging; the whole reply has 15 s. The widget shows animated dots with
"Thinking…", then a topic line at 2 s ("Looking through our work…") and "Almost there…" at 5 s, announced through a
`role="status"` region, and offers "Try again" on failure (client timeout 20 s).

Voice uses the same stream: the first clause and then each sentence go to Aura as soon as they pass, so speech starts
before the model finishes. If nothing is audible 1.2 s after the turn ends, the browser plays one short cached filler
("Let me check.") from `/assets/voice/filler-<n>.mp3` (made once with `npm run fillers`, Aura-2 luna, trimmed), and
the answer queues after it. The filler's echo does not count as a barge-in; talking over it stops it.

## Site knowledge

The assistant answers from `src/site-knowledge.js`: the public work, the ten services, process, cost wording, next steps, and a short "Why Cloudflare" list (about 1.2k tokens). It is generated from the marketing site's own data (`scrollcraft/builds/abracadabra-ai/scripts/site-data.mjs` and `service-sales.mjs`):

```sh
npm run knowledge
```

A test fails when the file is out of date, when it names a page that does not exist, or when a case-study name is not in the site source. The answer filter (`postCheck`) drops links to pages that are not in `SITE_PATHS`, turns copied paths into full links, keeps the closing booking or Readiness Check sentence when it trims, and replaces any reply that denies the portfolio or calls the work free.

## Voice

A hands-free call. One tap on the mic starts it; the visitor just talks, and taps End (or the mic) to stop.

```
browser mic ─AudioWorklet, 16 kHz PCM, 40 ms frames─► /api/chat/realtime (WebSocket, session Durable Object)
   └─► Flux (@cf/deepgram/flux over the AI binding WebSocket) ─ EndOfTurn ─► same chat brain + postCheck
   ◄── Aura-2 (luna) through AI Gateway as linear16 24 kHz, streamed chunk by chunk ◄──┘
```

- Turn taking: Flux decides when the visitor has finished (end-of-turn detection). Keyterms help it hear "Abracadabra".
- Barge-in: if Flux hears two or more new words while the reply is being made or played, the reply stops on both sides. Words that match the reply itself are treated as speaker echo and ignored. The browser asks for echo cancellation.
- The call stays "speaking" until the browser reports its queued audio has played, so barge-in keeps working to the last word.
- Protocol, server → browser: `ready`, `state` (listening, thinking, speaking), `interim`, `user`, `assistant`, `audio_start`, binary PCM, `audio_end`, `interrupt`, `notice`, `end`. Browser → server: binary PCM, `{type:"played"}`, `{type:"end"}`.

Guardrails: an open, Turnstile-checked session cookie and an allowed Origin before the socket opens; one open call per chat, 3 calls per chat, 6 calls per hour per IP; calls end at 5 minutes or after 45 quiet seconds; mic frames up to 16 KB and no faster than real time; 15 voice turns per chat; at most 400 spoken characters per reply and 3,000 per chat. Gateway cache and logging are off for speech. Audio is never stored. Only the words are kept, like a typed chat.

Cost at list price is about $0.026 per minute of call (Flux $0.0077 per minute plus Aura-2 at $0.030 per 1,000 characters), so about $0.13 for a full 5-minute call.

Deploy this Worker before the marketing Worker. The marketing `wrangler.jsonc` binds `CHAT` to the service name `abracadabra-chat`.

Cal.com bookings made in the panel should keep using the existing webhook on the readiness check. The widget also posts `booking_completed` so the chat handoff includes the time even before the webhook lands. The webhook parser reads `metadata.chat_session_id` and HQ stores it on the booking activity.

```bash
node --test test/*.test.js
npx wrangler dev
npx wrangler deploy
```

Do not point this Worker at a prospect inbox. The only recipient is houdini@.
