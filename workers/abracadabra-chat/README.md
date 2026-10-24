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
| `TTS_SPEAKER_AB` | Optional voice A/B test, e.g. `luna,thalia,andromeda`: each chat gets one, stable per chat, logged as `voice call: speaker=… (a/b)` and saved as `voiceSpeaker` on the session. Empty = off |
| `VOICE_EOT_THRESHOLD` | Flux end-of-turn confidence, 0.5 to 0.9, default `0.6` (set in `wrangler.jsonc`). Lower ends turns sooner |
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
before the model finishes. If nothing is audible 1.6 s after the turn ends, the browser plays one short cached filler
(ten context-neutral lines such as "Let me check." or "One sec.") from `/assets/voice/filler-<n>.mp3` (made once with
`npm run fillers`, Aura-2 luna, trimmed; the script also writes `src/filler-audio.js` and bumps the widget's
`FILLER_VERSION`), and the answer queues after it. Never on two turns in a row, only lines whose audio is built, and
not when the call uses a voice other than luna. The filler's echo does not count as a barge-in; talking over it stops it.

## Site knowledge

The assistant (typed chat and the voice call alike) answers only from `src/site-knowledge.js`: every case study, the products (Schema, LLM Leverage, HQ) with a short detail line each, the twelve services, every other page in `sitemap.xml` (named by its own `<title>` and meta description), every Notes article by title, process, cost wording, next steps, and a short "Why Cloudflare" list (about 3.5k tokens). Nothing is typed by hand except the PIRX and MCP locked-wording lines and the Cloudflare list. It is generated from the marketing site's own source and built pages (`scrollcraft/builds/abracadabra-ai/scripts/site-data.mjs`, `service-sales.mjs`, `super-funnel-case.mjs`, `sitemap.xml`, `**/index.html`):

```sh
npm run knowledge          # regenerate after any page, product or case-study change
npm run knowledge:check    # exit 1 if src/site-knowledge.js is stale
npm run knowledge:live     # read-only: does the deployed chat match this checkout? (GET /api/chat/config "knowledge")
```

Drift guards:

- `test/knowledge.test.js` fails when the file is out of date, when a sitemap page, product card or case study is missing from it, when it names a page that does not exist, or when it says "free" or a price.
- `npm run deploy` (this Worker) and `npm run deploy` in the marketing folder both run `--check` first, and the marketing tests include `tests/chat-knowledge.test.mjs`. A site change therefore cannot ship without the regenerated file.
- `.github/workflows/chat-knowledge.yml` runs the check and these tests on every PR touching either folder.
- `GET /api/chat/config` returns `knowledge`, a 12-character fingerprint of the knowledge, so `npm run knowledge:live` shows whether the live Worker is current. The knowledge is baked in at deploy: after the regenerated file merges, deploy this Worker (by hand, `npx wrangler deploy`; it is not on Workers Builds).

The answer filter (`postCheck`) drops links to pages that are not in `SITE_PATHS`, turns copied paths into full links, keeps the closing booking or Readiness Check sentence when it trims, and replaces any reply that denies the portfolio or calls anything free (the Readiness Check included). When the model is down, `localReply` still answers a question that names a product or case study ("Tell me about HQ") from its knowledge line and page. Voice speech-to-text is primed with every product and case-study name (`KEYTERMS`), so it hears "HQ" and "Super Funnel".

## Voice

A hands-free call. One tap on the mic starts it; the visitor just talks, and taps End (or the mic) to stop.

```
browser mic ─AudioWorklet, 16 kHz PCM, 40 ms frames─► /api/chat/realtime (WebSocket, session Durable Object)
   └─► Flux (@cf/deepgram/flux over the AI binding WebSocket) ─ EndOfTurn ─► same chat brain + postCheck
   ◄── Aura-2 (luna) through AI Gateway as linear16 24 kHz, streamed chunk by chunk ◄──┘
```

- Turn taking: Flux decides when the visitor has finished (end-of-turn detection). Keyterms help it hear "Abracadabra".
- Barge-in: if Flux hears three new words (or two that are still there after 400 ms) while the reply is being made or played, the reply stops on both sides. Words that match the reply itself are treated as speaker echo and ignored. The browser asks for echo cancellation.
- The call stays "speaking" until the browser reports its queued audio has played, so barge-in keeps working to the last word.
- Protocol, server → browser: `ready`, `state` (listening, thinking, speaking), `interim`, `user`, `assistant`, `audio_start`, binary PCM, `audio_end`, `interrupt`, `notice`, `end`. Browser → server: binary PCM, `{type:"played"}`, `{type:"end"}`.

Guardrails: an open, Turnstile-checked session cookie and an allowed Origin before the socket opens; one open call per chat, 3 calls per chat, 6 calls per hour per IP; calls end at 8 minutes or after 45 quiet seconds; mic frames up to 16 KB and no faster than real time; 25 voice turns per chat; at most 400 spoken characters per reply and 3,000 per chat. Gateway cache and logging are off for speech. Audio is never stored. Only the words are kept, like a typed chat.

Cost at list price is about $0.026 per minute of call (Flux $0.0077 per minute plus Aura-2 at $0.030 per 1,000 characters), so about $0.21 for a full 8-minute call at that rate. The 3,000 spoken characters per chat cap Aura-2 at about $0.09 a chat, so a long call often ends on that cost guard before the turn cap; Flux for 8 minutes is about $0.06.

Deploy this Worker before the marketing Worker. The marketing `wrangler.jsonc` binds `CHAT` to the service name `abracadabra-chat`.

Cal.com bookings made in the panel should keep using the existing webhook on the readiness check. The widget also posts `booking_completed` so the chat handoff includes the time even before the webhook lands. The webhook parser reads `metadata.chat_session_id` and HQ stores it on the booking activity.

```bash
node --test test/*.test.js
npx wrangler dev
npx wrangler deploy
```

Do not point this Worker at a prospect inbox. The only recipient is houdini@.

## Readiness Check in the chat

The chat can run the real Readiness Check one question at a time (`POST /api/chat/readiness`, `{op:"start"}` then `{op:"answer", stepId, answer}`).

- The chat creates a real assessment on the check worker (`POST /api/assessments`, utm `source=chat`, `chat_session_id`), sends each answer with `PATCH /api/assessments/<token>`, follows the `nextStep` the check returns, and calls `/complete` at the gate.
- The visitor then opens `https://check.abra-ca-dabra.app/check/<token>`. The check's own email gate, opt-in and report run there as usual. The chat never sends the email or the opt-in itself.
- Questions and options come from `readiness-check/src/lib/assessment/config.v1.json` through `npm run readiness`, which writes `src/readiness-questions.js`. Regenerate it whenever the check's questions change.
- Transport: the `READINESS` service binding to `readiness-check` (in `wrangler.jsonc`). Without the binding it uses `READINESS_ORIGIN`, which defaults to the public check origin.
- Answers have their own per-network allowance of 120 per hour, so they do not use up the typed-message limit.
- The check takes five to seven minutes, and the chat says so.

## Chat recap on the HQ lead

When a consented lead goes to HQ (`project-inquiry`), the message carries a `Recap:` line before the transcript (`src/recap.js`).
- **Summary:** two sentences from a small model (`AI_RECAP_MODEL`, default `@cf/meta/llama-3.1-8b-instruct-fast`; `none` turns it off). The prompt keeps only what the visitor said. Emails are masked. The call is capped at 4 seconds, and a slow or failed call just leaves the summary out.
- **Facts from the session:** services asked about, the Readiness Check band and pressures if it was taken in the chat, whether voice was used, the start page, and the number of questions.
- The recap is only built when a lead is actually posted. It is never shown to the visitor, and no email is sent.

## Weekly chat stats (anonymous) and the export

Each chat becomes one anonymous row when it goes quiet (the 15-minute idle alarm). If the visitor comes back, the same row is rewritten, so a chat is never counted twice.
- **What a row holds:** ISO week (Toronto time), number of questions, voice calls and turns, service topics and intents (pricing, timeline, privacy and security, integrations, about the studio) counted by keyword, the start page (site pages only, otherwise `other`), flags for booking offered, opened and completed, contact left, and Readiness Check started, finished and band, plus reply failures.
- **What a row never holds:** words, names, emails, IPs, or session or booking ids.
- **Storage:** rows live in one SQLite Durable Object (`ChatStatsDO`, binding `CHAT_STATS`, migration `v2`). Rows older than 26 weeks are pruned.

Export (server to server, no CORS):

    curl -s -H "Authorization: Bearer $CHAT_STATS_TOKEN" "https://abra-ca-dabra.app/api/chat/stats?weeks=2"
    curl -s -H "Authorization: Bearer $CHAT_STATS_TOKEN" "https://abra-ca-dabra.app/api/chat/stats?week=2026-W43&format=csv"

- `weeks` takes 1 to 12 (default 2, newest last).
- **Token:** set it with `wrangler secret put CHAT_STATS_TOKEN` (24 characters or more). Without it the route returns 404. The token is accepted only in the header, never in the URL.
- **Rate limit:** 30 tries an hour per network.
- **Switching off:** `CHAT_STATS_ENABLED=false` stops new rows.

The new Durable Object needs `wrangler deploy` once, because `versions upload` cannot apply a migration.

## Quality check (20 questions, real models)

    AI_GATEWAY_TOKEN=... CF_ACCOUNT_ID=... npm run quality      # 70B and 8B side by side
    node scripts/quality-check.mjs --models 70b --out /tmp/q.md # one model
    node scripts/booking-cadence.mjs --src ./src --json /tmp/after.json   # how often whole conversations pitch the session
    node scripts/booking-cadence.mjs --compare /tmp/before.json /tmp/after.json --out reports/booking-cadence.md

The check sends 20 fixed questions through the live answer path: system prompt, sentence checks, and page context for the two voice cases. The questions cover services, cost, timeline, location, healthcare data, a named integration, examples, Readiness Check length, booking, a phone number, prompt injection, off-topic, comparison with agencies, free trial, a law-firm need, video, ChatGPT visibility, and two vague voice questions asked on a page.

Each answer gets automatic checks:
- the expected point is there
- no forbidden content (prices, phone numbers, a poem)
- no talk about being an AI or the model
- no post-check replacement

The report also gives first-sentence latency. The command exits 1 when the default model fails a check. Nothing is stored or posted. Reports from 2026-10-19 are in `reports/`.
