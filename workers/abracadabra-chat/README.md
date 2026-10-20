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
| POST | `/api/chat/voice` | Push-to-talk clip (raw audio body) → Whisper → the same chat answer. Returns `{transcript, reply, action, replyId}` |
| POST | `/api/chat/speak` | `{replyId}` → Aura-2 MP3 of that session's own spoken reply. Never reads free text |

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
| `AI_MODEL` | Workers AI model id. Defaults to `@cf/meta/llama-3.1-8b-instruct-fast` |
| `HANDOFF_HMAC_SECRET` | Signs the `abra.chat.handoff` v1.0 JSON in the houdini@ mail |
| `CHAT_HANDOFF_TO` | Must include `houdini@abra-ca-dabra.app`. Anything else is ignored |
| `CHAT_ORIGINS` | Extra allowed `Origin` values, comma-separated |
| `VOICE_ENABLED` | `"true"` shows the mic (set in `wrangler.jsonc`). `"false"` turns voice off |
| `TTS_SPEAKER` | Aura-2 voice, default `luna`. Unknown names fall back to `luna` |
| `STT_MODEL` / `TTS_MODEL` | Optional. Default `@cf/openai/whisper-large-v3-turbo` and `@cf/deepgram/aura-2-en` |

## Voice

Push-to-talk only. The visitor taps the mic, talks, and taps again (the widget stops at 30 seconds). The clip goes to `/api/chat/voice`, Whisper turns it into words (with a hint so "Abracadabra" comes out right), and the words take the normal chat path and checks. The reply then plays out loud from `/api/chat/speak`. Typed questions stay silent.

Guardrails: an open, Turnstile-checked session; clips up to 600 KB and 30 seconds; only webm, mp4, ogg, mp3, and wav, checked by their first bytes; 15 voice turns per hour per IP and 15 per session; at most 400 spoken characters per reply, two plays per reply, and 3,000 spoken characters per session. Gateway cache and logging are off. Audio is never stored. Only the words are kept, like a typed chat.

Deploy this Worker before the marketing Worker. The marketing `wrangler.jsonc` binds `CHAT` to the service name `abracadabra-chat`.

Cal.com bookings made in the panel should keep using the existing webhook on the readiness check. The widget also posts `booking_completed` so the chat handoff includes the time even before the webhook lands. The webhook parser reads `metadata.chat_session_id` and HQ stores it on the booking activity.

```bash
node --test test/*.test.js
npx wrangler dev
npx wrangler deploy
```

Do not point this Worker at a prospect inbox. The only recipient is houdini@.
