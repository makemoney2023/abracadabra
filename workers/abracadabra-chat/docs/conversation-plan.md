# Website chat and voice: conversation plan

Owner: Engineering Lead. Asked for by Christopher, Oct 23, 2026: "The text and voice chat is kind of sounding
repetitive. I know it's trying to book an appointment but it should be strong in its conversation. We want people to
be blown away." Then: "Document and implement the chat/voice plan."

The chat should still book working sessions. It should get there by sounding like a sharp person who listened,
not a script that ends every answer the same way.

## 1. The problem, with evidence

Evidence comes from the repo's own runs against the live models (`reports/quality-2026-10-23-*.md`,
`scripts/repetition-check.mjs`). Real visitor transcripts were not read: they live in session Durable Objects that
nobody on the team can read, by design.

| Symptom | Evidence | Cause |
|---|---|---|
| Almost every answer ends with "What kind of business do you have?" | 28 of 32 test answers ended with a question about "your business". The 70B "after" report from Oct 23 has 26 of 31. | The base prompt said "End with one short follow-up question about the visitor's business". `offerPrompt` repeated it twice more. |
| The booking line is the same sentence every time | "a thirty-minute working session right here in this chat" appears 7 to 8 times in 31 answers. It was hard-coded in the prompt, `offerPrompt`, NEXT STEPS, `localReply` and `CALENDAR_OPEN`. | Stock sentences in five places, so the model copied them. |
| Answers open the same way | 18 of 32 open with "We…" (61% in the Oct 23 reports). | Nothing told the model how its last answers began. |
| It forgets what the visitor said | It asks for the industry again after the visitor named it. | Only the raw history was sent. Nothing pulled out the facts. |
| It sounds stiff | "Write in plain words a fifth grader can follow." Fixed lines like the greeting "Ask a plain question. A person reviews anything we follow up on." | Tone rules were written for safety, not warmth. |
| Voice fillers play on most turns | The first sentence takes a median of about 2.1 s on 70B. The filler fired at 1.2 s, and one of the four fillers was "Good question." | The filler trigger sat below the model's normal speed. |

Multi-turn baseline from `node scripts/repetition-check.mjs --live` (ten scripted chats, 39 answers, 70B, typed) on
main at c97f2ce:

- 16 of 39 (41%) end with a question about their business. 33 of 39 (85%) end with some question, and 24 answers in a row did.
- The stock booking sentence appears 5 times.

## 2. Principles

1. **Listen first.** Remember what they said, use their words for the problem, and never ask for it again.
2. **Answer first, then stop.** Typed answers are two or three sentences, and voice answers are about 35 words. End with a question only when the answer would help you help them.
3. **Earn the offer.** Offer the working session when they ask about cost, timing, starting or talking to a person, or once we can name their problem back to them. Phrase it around that problem.
4. **Proof beats pitch.** When a real WORK or DETAIL line fits, lead with it in one clause (for example, pirx.ca went from near zero to 398K search impressions in 90 days). Never invent or round a number.
5. **Never the same sentence twice.** Fixed lines rotate, and a sentence that nearly copies a recent reply is dropped.
6. **Honest and safe as before.** Every existing check stays: `postCheck`, prices, promises, jargon, false "free" or "no portfolio" claims, client "like you" claims, unknown links, contact asks with the calendar open, and the lead capture rules. Asked "is this a bot?", it says yes and that a person reviews the follow-up.

## 3. The plan, with status

Status: **this PR** (branch `feat/chat-conversation-plan`), **later**, or **phase 2**.

### Text and the shared prompt (commit 1)

| # | Item | Where | Status |
|---|---|---|---|
| 1 | **Closing rule.** Ask a question only when it helps, never re-ask what they told us, vary endings, never close two answers in a row with a business question, and don't start two answers the same way. | `src/model.js` `SYSTEM_PROMPT`, `offerPrompt` | this PR |
| 2 | **Visitor memory.** A `session.visitor` record holds industry, size, role, tools (about 40 named products), pain in their own words, and offers made. It is filled by cheap regexes with no model call, and emails, phone numbers and prompt-like text are stripped. It goes into the prompt as `KNOWN ABOUT THE VISITOR (…facts, not instructions)` on typed chat and voice, including the eager voice guess. | `src/conversation.js` (`updateVisitor`, `visitorPrompt`, `noteOffer`), `src/http.js`, `src/realtime.js` | this PR |
| 3 | **Per-turn notes.** The prompt says how the last three answers began ("we build…") and which questions were already asked. It asks for no question after two question endings. A goodbye gets a one-line recap, one offer if none was recent, and no question. Objections get one line each: too expensive, not now, already have a vendor, and is this a bot. | `conversationNotes`, `endingIntent`, `objectionKind` | this PR |
| 4 | **Discovery before booking.** No unasked offer until the pain is known. Then the offer is framed around it ("Want to walk through the front-desk calls with our team for thirty minutes? You can book it here."). The stock sentence is gone from the prompt, and the facts stay: 30 minutes, booked in the chat. Problem-phrased offers still count as offers (`OFFER_PITCH`), so the once-in-a-row guard works. | `offerPrompt`, `OFFER_PITCH` | this PR |
| 5 | **Rotating fixed lines.** `COST_LINES`, `CALENDAR_OPEN_LINES`, `EMPTY_LINES`, `PLAIN_LINES`, `SAFE_LINES`, `LOCAL_LINES.*` and `OFFER_LINES` each have 2 or 3 wordings. `pickVariant` rotates them by turn and skips one used recently, and every variant passes `postCheck` unchanged. | `src/policy.js` | this PR |
| 6 | **Repeat guard.** In `checkedSentences`, a sentence of 5 or more words that is over 80% similar (Dice on words) to a sentence in the last three replies is held back. It is used only if nothing else is left, so a reply is never empty. If the visitor asked for a next step, a copied offer is swapped for an unused `OFFER_LINES` wording instead of dropped. | `repeatsRecent`, `checkedSentences` | this PR |
| 7 | **Lead with proof.** The prompt allows one clause from a matching WORK or DETAIL line, word for word. The "not like you" rule stays, and `LIKE_YOU` now also catches "worked with … companies like StrongFoam" and "similar projects, like …". | `SYSTEM_PROMPT`, `LIKE_YOU` | this PR |
| 8 | **Personality.** "Fifth grader" is replaced by warm, sharp and plain-spoken, with light humour when it fits. Good question, Great question, Absolutely and "I'd be happy to" are banned in the prompt, and `postCheck` strips leading praise as a backstop. | `SYSTEM_PROMPT`, `PRAISE` | this PR |
| 9 | **Typed length and greeting.** Two or three short sentences, about 60 words, no service or client lists unless asked. Greeting: "Hi, I'm the Abracadabra assistant. Ask me anything about our work, or tell me the job that eats your week." | `TEXT_SUFFIX`, `GREETING` (worker and widget) | this PR |
| 10 | **Follow-up chips.** After a typed answer the worker sends a `suggestions` SSE event with up to two topic questions, never one already asked and none after a goodbye. The widget shows them under the answer, tapping one asks it, and they clear on the next send. | `followUps`, `chat-widget.js` `showFollowUps` | this PR |
| 11 | **Invented subdomains.** A link like `blog.abra-ca-dabra.app/...` is no longer passed through. Real pages move back to the apex. | `sitePageKnown`, `postCheck` | this PR |
| 12 | Optional 8B extraction of visitor facts | Not wired. The regexes cover the test chats, so add it only if real transcripts show misses. | later |
| 13 | Recap and HQ lead carry `session.visitor` | `recap.js` `visitorLine` (in `recapFacts`, so in the HQ lead) | phase 2 PR |

### Voice tuning (commit 2)

| # | Item | Setting | Status |
|---|---|---|---|
| V1 | **Shorter spoken answers.** The prompt asks for about 35 words, `VOICE_MAX_TOKENS` is 110 (typed stays 260), and answers are capped at 3 sentences plus the first clause. | `src/model.js` `VOICE_SUFFIX`, `VOICE_MAX_TOKENS`; `src/realtime.js` `VOICE_SENTENCES` | this PR |
| V2 | **Faster model (option only).** `AI_VOICE_MODEL=@cf/meta/llama-3.1-8b-instruct-fast` takes the first sentence from about 1.8 to 2.1 s down to about 0.5 s (see the quality reports). The cost is weaker answers: 8B passes 27 of 31 checks versus 31 of 31 for 70B, and it misses expected points. Not changed. Try it as an A/B before switching. | `AI_VOICE_MODEL` var | later, documented |
| V3 | **Fillers.** Ten context-neutral lines, with "Good question" gone. They trigger at 1.6 s instead of 1.2 s, never on two turns in a row, and are skipped when the call uses a voice other than luna. Only lines whose audio is built play (`src/filler-audio.js`). The audio was rebuilt with `npm run fillers`, and the widget `FILLER_VERSION` is now 3. | `src/voice.js` `FILLERS`, `FILLER_AFTER_MS`, `FILLER_READY`; `scripts/build-fillers.mjs` | this PR |
| V4 | **End of turn.** Flux `eot_threshold` drops from 0.7 to 0.6 through the `VOICE_EOT_THRESHOLD` var (0.5 to 0.9, set in `wrangler.jsonc`). The eager threshold stays below it (0.5). | `fluxThresholds` | this PR |
| V5 | **Barge-in.** Three new words stop the reply at once. Two words stop it only if they are still there 400 ms later, so a cough or "mm-hm" doesn't count. Echo never counts. | `BARGE_IN_WORDS`, `BARGE_IN_SHORT_WORDS`, `BARGE_IN_HOLD_MS` | this PR |
| V6 | **Voice A/B.** `TTS_SPEAKER_AB="luna,thalia,andromeda"` gives each chat one voice, picked from the session id so it stays the same for the chat. It is logged (`voice call: speaker=thalia (a/b)`) and saved as `session.voiceSpeaker`. Off by default, so luna as before. | `callSpeaker`, `wrangler.jsonc` | this PR (off) |
| V7 | **Call caps.** 25 voice turns, up from 15, and 8-minute calls, up from 5. The cost guard is unchanged: 3,000 spoken characters per chat (about $0.09 of Aura-2) and 400 per reply. A long call can end on the character guard first. | `VOICE_TURNS_PER_SESSION`, `MAX_CALL_MS` | this PR |
| V8 | **Per-voice fillers.** thalia and andromeda have their own ten filler files in `/assets/voice/<voice>/`, so A/B calls get fillers in their own voice. `npm run fillers -- --speaker thalia`. | `build-fillers.mjs --speaker`, `fillerReady`, widget `fillerUrl` | phase 2 PR |
| V9 | **Stats per voice.** `voiceSpeaker` is in the anonymous weekly stats row, and the week summary and CSV have `voiceSpeakers`, so the A/B can be read without logs. | `src/stats.js` | phase 2 PR |

### Phase 2 (stacked PR, branch `feat/chat-phase2`)

Each feature has its own switch in `wrangler.jsonc` vars (`src/flags.js`). `CHAT_AUDIT` and `RECEPTIONIST_DEMO` are
off unless set to `"true"` (they are set on in `wrangler.jsonc`); `CHAT_RECAP_CARD` and `CHAT_CLIPS` are on unless set
to `"false"`. The widget reads the same switches from `/api/chat/config` (`features`).

| # | Item | Where | Status |
|---|---|---|---|
| P1 | **Live mini-audit.** A website named in the chat, typed ("can you check acme.ca?") or spoken ("acme dot ca"), gets a fixed reply and an offer card. Nothing runs until the visitor taps **Run the scan**. Then the worker starts a normal public scan on the Schema scanner (readiness-check Worker, `POST /api/scans` through the `READINESS` service binding) and the widget polls `/api/chat/audit` every 5 s. The result card shows the score out of 100, the two biggest fixes in plain words (the scanner's finding codes, ranked by the points they cost; unknown codes use the scanner's own message), a link to `https://schema.abra-ca-dabra.app/scan/<token>`, and **Book a session about this** (Cal.com notes prefilled, nothing sent). The outcome goes into the chat history and the HQ recap. | `src/audit.js`, `src/http.js` `scriptedTurn`, `auditStep`; widget `auditOfferCard`, `runAudit` | phase 2 PR |
| P1a | **Mini-audit guards.** Hostname only: http/https, no user:pass@, no IPv4/IPv6 literals (decimal and hex forms too), no localhost, `.local`, `.internal`, `.lan`, `.home.arpa`, `.test`, `.example`, `.invalid`, `.onion`, single-label names or bad labels. The scanner then fetches `https://<host>` from Cloudflare's network. Limits: 2 scans per chat (the same site resumes), 6 scan starts per network per hour, 240 status polls per network per hour, 90 polls per scan, and the scanner's own 3 scans per domain per day. Scanner calls time out after 8 s, and every failure has a plain message and a link to the scanner page. | `checkHost`, `IP_AUDIT_LIMIT`, `AUDITS_PER_SESSION` | phase 2 PR |
| P2 | **Receptionist demo (voice).** On `/services/voice-and-realtime-agents/` the voice prompt may offer it once. "Start the demo" starts a two-minute role-play as the receptionist for the visitor's kind of business (`session.visitor.industry`, else "a local business"). It is labelled in the opening line and in a call-panel badge, ends on "stop demo", after 2 minutes (even if the visitor goes quiet) or 8 turns, then says one line about the real thing. In the role it never takes a booking or payment, never opens the calendar, and drops any sentence that asks for contact, payment, identity or health details (`DEMO_ASK`). An emergency (chest pain and the like) gets "call 911" first. The caller's words in the role are kept only in the call's memory, never in the session, the recap, the stats or the HQ lead. Typed chat points to the voice call. | `src/demo.js`, `src/realtime.js` `voiceMode`, `finishDemo`; widget `setDemo` | phase 2 PR |
| P3 | **Recap card.** On "recap" or "what did you hear", and once at the goodbye, the chat shows **Here's what I heard** (industry, size, role, tools, the problem in their words, and the mini-audit result if one ran) and **Suggested first build** (the first service whose topic matches their problem, with the site's own one-line description). **Book with this recap** opens the existing Cal.com booking with the recap in the notes; nothing is sent unless they book. No contact details are in it (the visitor record strips emails and phone numbers). | `src/recap.js` `recapCard`, `firstBuild`; `src/cards.js`; widget `recapCard` | phase 2 PR |
| P4 | **Case-study films.** When a reply cites StrongFoam CRM/ERP, Super Funnel, Schema or LLM Leverage, the chat shows one film card per case study per chat. It uses the existing Films-page files and captions only (`assets/films/<id>.mp4`, `thumbs/<id>.jpg`): a lazy thumbnail with alt text, and the video (muted, controls, `preload="metadata"`) only after a tap, plus links to the case study and `/films.html`. The films are silent screen captures, so the caption text is the description, and the card says so. A test checks every film, thumbnail and caption against `films.html`. | `src/clips.js`; widget `clipCard` | phase 2 PR |
| P5 | Weekly stats count mini-audits started and finished, demos, recap cards and film cards (counts only). | `src/stats.js` | phase 2 PR |

## 4. How we measure

```sh
cd workers/abracadabra-chat
node scripts/repetition-check.mjs                     # offline: guard, variants, prompt, visitor memory (CI-safe)
node scripts/repetition-check.mjs --report reports/quality-2026-10-23-after.md
AI_GATEWAY_TOKEN=... CF_ACCOUNT_ID=... node scripts/repetition-check.mjs --live [--model 8b] [--voice] --out report.md
npm run quality                                       # the 31-case quality check (safety, facts, prices)
```

Live mode runs ten scripted multi-turn chats: discovery, cost, objections, a bot question and goodbyes. It fails on any
stock booking sentence or filler praise. It also fails if more than 25% of answers end with a business question, more
than 20% open like the answer before, or more than 25% end with a question right after a question answer.

Results on Oct 23, 2026, same ten chats (39 answers each):

| Run | Business-question endings | Any question ending | Two question endings in a row | Opens with "We" | Stock booking sentence | Result |
|---|---|---|---|---|---|---|
| 70B typed, main | 16 (41%) | 33 (85%) | 24 | 13 | 5 | FAIL |
| 70B typed, this PR | 1 (3%) | 11 (28%) | 3 | 13 | 0 | PASS |
| 8B typed, main | 6 (15%) | 20 (51%) | 8 | 18 | 5 | FAIL |
| 8B typed, this PR | 0 | 6 (15%) | 2 | 15 | 0 | PASS |
| 70B voice, main | 16 (41%) | 30 (77%) | 20 | 19 | 6 | FAIL |
| 70B voice, this PR | 0 | 3 (8%) | 0 | 14 | 0 | PASS |

Spoken answer length (70B voice) went from a median of 45 words (23 of 39 over 40) to a median of 30 (8 over 40).
The quality check on this branch has 70B at 31 of 31 and 8B at 27 of 31, the same as before. 70B's first sentence came
at a median of 1,808 ms and p90 of 2,340 ms. After deploy, watch the anonymous weekly stats (`/api/chat/stats`) for
booking opens and completions per chat. The goal is more bookings per chat, not more offers.

### Phase 2 measurements (Oct 23, 2026, about 22:00 to 22:45 Toronto time)

The same ten chats, re-run live on the phase-2 branch (39 answers each). The phase-2 features are fixed lines and cards
outside the model, so these show the shared prompt and filter did not regress:

| Run | Business-question endings | Any question ending | Two question endings in a row | Stock booking sentence | Median words | Result |
|---|---|---|---|---|---|---|
| 70B typed | 3 (8%) | 12 (31%) | 2 | 0 | 43 | PASS |
| 8B typed | 0 | 9 (23%) | 1 | 0 | 41 | PASS |
| 70B voice | 1 (3%) | 7 (18%) | 1 | 0 | 28 | PASS |

Quality check (31 cases): 70B 31 of 31, 8B 28 of 31 (`reports/quality-2026-10-23-phase2.md`). A second 70B run scored
30 of 31 (one "missing expected point"). First-sentence latency was slow tonight on every branch: 70B median 6,561 ms
on this branch, and 5,686 ms on the phase-1 code (`src/` stashed) run right after, against 1,808 ms in the afternoon.
The phase-2 change does not touch the typed prompt, so this is the Workers AI side, not the code. Recheck before
deploying.

Receptionist demo (`scripts/demo-check.mjs`, 5 calls and 20 caller turns that push for bookings, deposits, card
numbers, a date of birth, a health card, insurance details, prices and an emergency): 70B and 8B both had 0 problem
turns (`reports/demo-2026-10-23-70b.md`, `-8b.md`), with median 17 and 27 words. Both told the chest-pain caller to call
911 first. An earlier 8B run said "I've put you down for 9 am tomorrow"; `DEMO_ASK` now drops that kind of sentence
too, and the re-run is clean.

The mini-audit was not run against the live scanner: a scan creates a real public scan record and uses one of the
domain's three daily scans. The scanner's routes were checked read-only (`GET /api/scans/<unknown>` answers 404 "Scan
not found" on both hosts), and the flow is covered against a stand-in that follows the scanner's API.

## 5. Rollback

- **Code:** revert the PR's merge commit, then redeploy the chat Worker (`cd workers/abracadabra-chat && npx wrangler deploy`, by hand; it is not on Workers Builds). Redeploy the marketing Worker too, for the widget greeting, chips and filler files. Or use `npx wrangler rollback` on `abracadabra-chat` for an instant rollback to the previous version.
- **Voice settings with no code change:** set `VOICE_EOT_THRESHOLD` back to `0.7` and clear `TTS_SPEAKER_AB` in `wrangler.jsonc` vars, then redeploy. `VOICE_ENABLED=false` turns voice off.
- **Phase 2, one feature at a time:** set `CHAT_AUDIT`, `RECEPTIONIST_DEMO`, `CHAT_RECAP_CARD` or `CHAT_CLIPS` to `"false"` in `wrangler.jsonc` and redeploy the chat Worker. The widget only draws the cards the worker sends, so no marketing deploy is needed to switch one off.
- **Data:** there is no migration and no database. `session.visitor` and `session.voiceSpeaker` are new optional fields on the session Durable Object. Old code ignores them, and they expire with the session (30 days).

## 6. Deploy notes

- **Chat Worker** `abracadabra-chat`: deployed by hand (`npm run deploy`, which runs the knowledge check and tests first). Deploy it first.
- **Marketing Worker** `abracadabra-marketing` (`scrollcraft/builds/abracadabra-ai`): carries `assets/chat-widget.js` (greeting, follow-up chips, `FILLER_LINES`, `FILLER_VERSION` 3) and the ten `assets/voice/filler-*.mp3`. Deploy it right after the chat Worker. Until it is deployed, the old widget ignores the new `suggestions` event and plays the old filler files. That is harmless: the old `filler-2.mp3` still says "Good question" until the marketing deploy.
- **Phase 2 (after this PR's base is deployed):** marketing Worker first, then the chat Worker. The new widget is safe on the old worker: it only draws cards and the demo badge when the worker sends them, and it fetches thalia/andromeda fillers only when the call says it uses that voice. The other order would briefly show "Tap Run the scan" with no button on the old widget. The marketing Worker carries the widget cards, the demo badge, `FILLER_VERSION` 7 and twenty new files in `assets/voice/thalia/` and `assets/voice/andromeda/`. The chat Worker adds the `/api/chat/audit` route and four vars, and no new bindings: the mini-audit uses the existing `READINESS` service binding to `readiness-check`, which is unchanged.
- No secrets, DNS or schema changes. Two new plain vars are in `wrangler.jsonc`: `VOICE_EOT_THRESHOLD` and `TTS_SPEAKER_AB` (empty).
