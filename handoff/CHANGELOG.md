# Changelog

## 2026-10-07

- **What changed** — A finished website scan files its schema package as finished work on the matching Space and opens a Work-board task.
- **Why** — Checking a URL should produce the structured schema, not only a score.
- **Code touchpoints** — `handoff/src/lib/schema-work.ts`, `handoff/src/lib/intake/consume.ts`, `handoff/src/lib/intake/queue.ts`, `handoff/src/lib/intake/accept.ts`, `handoff/src/app/api/intake/schema/route.ts`
- **Data-flow impact** — `POST /api/intake/schema` queues `{ source: "schema" }`. The consumer matches `organizations.domain`, or creates a client, a Website project, and a Space. It inserts a published `website` deliverable and a `todo` task titled `Schema for {domain}`.
- **API / schema impact** — new signed intake path. No database migration.
- **Verification** — `npx vitest run src/lib/schema-work.test.ts src/lib/intake/consume.test.ts src/app/api/intake/schema/route.test.ts` in `handoff/`.

## 2026-10-07

- **What changed** — Deployed the chat and client-channel work. `HQ_CHAT_SECRET` and `CLIENT_CHANNEL_SECRET` are set on `handoff-hq` and `handoff-agent`. `AGENT_WAKE_SECRET` is set on `handoff`, `handoff-hq`, and `handoff-agent`. Email Routing sends `magic@abra-ca-dabra.app` to worker `handoff-agent`. The empty `AGENT_WAKE_SECRET` variable was removed from the agent config so the secret is the value that ships.
- **Why** — The email handler is deployed, so the routing rule can deliver mail. Chat and wakes need a shared secret that is not in git.
- **Code touchpoints** — `handoff/wrangler.agent.jsonc`
- **Data-flow impact** — Mail to `magic@` now reaches `email()` on `handoff-agent`.
- **API / schema impact** — none.
- **Verification** — Worker `handoff` version `c7f149d3-ec62-4958-84c8-d191870a1d5f`. Worker `handoff-hq` version `d4f704f4-17b4-4a8b-8ee5-b89bb37b8aa9`. Worker `handoff-agent` version `2b53048b-6245-4c40-b9b1-67581b47ea14`. The Email Routing API reports the rule enabled. The Slack app is still not created.

## 2026-10-07

- **What changed** — Steps 24–27 of the HQ agent plan, plus the channel checks that do not need a deploy. A client approving a brief wakes `brief_approved` when nothing is planned yet and `brief_changed` after that. A denial wakes `context_changed`. A paused client is not woken. Today has Needs you for proposed requests, with Approve and Decline. A client page lists conversations and lets staff reply. Chat sits on the client, project, and work pages and tells the model which record is open. A sender on two clients is asked which one. Staff Slack posts are logged and not answered. An unlinked Slack channel is noted once.
- **Why** — Staff need to see and answer client threads before email and Slack go live.
- **Code touchpoints** — `handoff/src/lib/agent-wake.ts`, `handoff/src/app/w/[slug]/work/actions.ts`, `handoff/src/db/conversations.ts`, `handoff/src/db/crm.ts`, `handoff/src/app/today-screen.tsx`, `handoff/src/app/clients/[id]/page.tsx`, `handoff/src/app/clients/actions.ts`, `handoff/src/app/clients/thread-forms.tsx`, `handoff/src/app/chat/chat-panel.tsx`, `handoff/src/lib/hq-chat-context.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/lib/client-channel.ts`, `handoff/src/lib/slack-channel.ts`, `handoff/src/app/api/client-messages/route.ts`
- **Data-flow impact** — Brief approval reads `agent_paused_at` and whether the client has tasks. `todayFor` includes proposed `work_requests`. Staff replies are `staff.reply` activities. Decline of an email request tries to mail the reason.
- **API / schema impact** — `/api/client-messages` gains `thread_org`, `unlinked_slack`, and `staff_log`. Lookup now returns every organization for the sender.
- **Verification** — The conversation, email, Slack, wake, chat-context, and HQ tool tests passed. `npx tsc --noEmit` exited 0. Not done, because they need secrets or a live service: the real `Authentication-Results` fixture, deploying, the `magic@` routing rule, the Slack app, email attachments, and the agent type-check config.

## 2026-10-07

- **What changed** — Approving a client request writes a draft invoice for that piece, at $0, for staff to price and send. A brief the client must approve is published to their space at `/w/[slug]/work/[id]`, with Approve, Deny, and Add a note. Approve wakes the agent (`brief_approved` on the first version, `brief_changed` after that). Deny wakes `context_changed`. A note does not.
- **Why** — New client work needs a quote, and the client needs a page to accept or refuse the brief.
- **Code touchpoints** — `handoff/src/db/crm.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/agent-wake.ts`, `handoff/src/app/w/[slug]/work/actions.ts`, `handoff/src/app/w/[slug]/work/forms.tsx`, `handoff/src/app/w/[slug]/work/[id]/page.tsx`, `docs/hq-agent-spec.md`
- **Data-flow impact** — `decide_work_request` inserts `invoices` and `invoice_items` with `external_id` set to the request id. A client-owned addendum sets `published_version` and `status='in_review'`. The work page posts `comment` as well as `approve` and `changes`.
- **API / schema impact** — none. Wake reason `brief_approved` is now sent from the brief page. It was already handled by the agent.
- **Verification** — `npx vitest run` on the HQ tool, wake, and deliverable tests passed. `npx tsc --noEmit` and `npx eslint` on the touched files exited 0. The brief page was not clicked in a browser: that needs a client signed into the space.

## 2026-10-07

- **What changed** — The HQ agent spec records the state of steps 17–23 and adds steps 24–31 from the review: client brief approval wakes the agent, a Conversations tab with staff replies, client requests in Needs you, the chat side panel, email go-live (header check, HQ reachability, secrets, then the routing rule, plus the multi-client question and attachments), Slack go-live, an agent type check, and better client message sorting. Section 18 gains the open decision on message sorting and a note on `ClientDesk`.
- **Why** — The review found work the plan needs before clients can write in.
- **Code touchpoints** — `docs/hq-agent-spec.md` (section 16 status note and steps 24–31, section 18). No code.
- **Data-flow impact** — none.
- **API / schema impact** — none yet. Planned: wake reason `brief_approved` in `WakeReason`, `tsconfig.agent.json`.
- **Verification** — doc only.

## 2026-10-07

- **What changed** — Review of the chat and client-channel work. The email check now needs a pass that belongs to the sender's domain, and reads only the topmost `Authentication-Results` header. Email bodies are parsed with `postal-mime`. Replies thread on the root `References` id, carry `Message-ID`, `References`, and `Auto-Submitted`, and a refused reply no longer fails the handler. One open request per thread collects each message and counts questions, so the three-question cap holds. Slack replies stay in their thread; edits, joins, and mentions are ignored; the lookup and reply run after the 200. Approving a client request takes the piece kind and outcome from staff, and records `decided_by`, `decided_at`, `decline_reason`, and `brief_version`. Decline needs a reason. `add_work` and approved requests wake the agent only when staff own brief approval. Re-planning creates a draft and a task in the project for each new piece, keeps the piece's stage, and skips a paused client. Stage moves, pauses, answers, brief changes, and request decisions write a staff activity with `via='hq_chat'`. Chat tools have descriptions and a system prompt. The chat token refreshes every eight minutes. The approval card shows the action and its fields. `invite_person` sends mail. New tool `link_slack_channel`.
- **Why** — Any domain's DKIM pass let a stranger write as a client. Approving a client request always failed because nothing named the piece. Each email reply started a new thread. Added work re-planned before the brief was approved. Chat stopped working after ten minutes.
- **Code touchpoints** — `handoff/src/lib/client-channel.ts`, `handoff/src/lib/slack-channel.ts`, `handoff/src/lib/client-channel-store.ts`, `handoff/src/db/conversations.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/hq-tool-names.ts`, `handoff/src/lib/client-plan.ts`, `handoff/src/agent/worker.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/app/chat/chat-panel.tsx`, `handoff/src/app/chat/approval-card.ts`, `handoff/src/app/api/client-messages/route.ts`, `handoff/src/app/api/hq-tools/route.ts`, `handoff/migrations/0009_conversations.sql`, `handoff/wrangler.agent.jsonc`. Removed `handoff/src/agent/client-desk.ts`: it returned fixed JSON and nothing called it.
- **Data-flow impact** — `/api/client-messages` action `recent_replies` is replaced by `thread`, which returns reply count, question count, and the open request text. Action `link_slack` is removed; linking goes through `/api/hq-tools`.
- **API / schema impact** — `0009_conversations.sql` (not yet deployed) gains `decided_by`, `decided_at`, `decline_reason`, `brief_version`, and indexes on state and thread. Migration tag `v2` adds only `HqChat`.
- **Verification** — `npm test` in `handoff/` passed 411 node tests and 6 agent tests. `npx tsc --noEmit` and `npx eslint` on the changed files exited 0. `wrangler deploy --dry-run` for `handoff-agent` bundled.

## 2026-10-07

- **What changed** — Staff can open `/chat` on the HQ host and run HQ reads immediately. Client-facing tools, brief adds, and agent directions wait for approval. Client email and Slack notes are classified and stored as work requests. A brief change wakes the client agent with `brief_changed`. `/chat` on the client host is not found.
- **Why** — Staff need a conversation that can add records and correct a brief. Clients need a receipt when they write to magic@ or Slack.
- **Code touchpoints** — `handoff/src/lib/hq-chat-token.ts`, `handoff/src/lib/staff-request.ts`, `handoff/src/lib/hq-tools.ts`, `handoff/src/lib/client-channel.ts`, `handoff/src/lib/slack-channel.ts`, `handoff/src/db/conversations.ts`, `handoff/src/agent/hq-chat.ts`, `handoff/src/agent/worker.ts`, `handoff/src/app/chat/page.tsx`, `handoff/src/lib/host.ts`, `handoff/migrations/0009_conversations.sql`, `handoff/wrangler.agent.jsonc`
- **Data-flow impact** — Chat tools POST to `/api/hq-tools`. Email and Slack POST to `/api/client-messages`. Approved `add_work` appends a brief addendum and wakes the organization.
- **API / schema impact** — `0009_conversations.sql` adds `work_requests` and `slack_channel_links`. New routes: `/api/hq-chat/token`, `/api/hq-chat/whoami`, `/api/hq-tools`, `/api/client-messages`. Durable Object class `HqChat` (migration tag `v2`).
- **Verification** — Chat, tool, email, Slack, brief-change, token-route, and host tests passed. `npx vitest run --config vitest.agent.config.mts` passed 6 tests after the agent test env gained `HQ_ORIGIN`, `MAGIC_EMAIL_FROM`, and `send_email`. Unsigned `/chat` on `hq.localhost` returns 404, the same gate as `/clients`. `/chat` on the client host returns "This page is not here." The composer was not exercised: there is no staff session in this browser. The `magic@` routing rule is still not created.

## 2026-10-07

- **What changed** — Email Routing is on for `abra-ca-dabra.app`. The apex has Cloudflare MX records, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` in place of `v=spf1 -all`, and DKIM `cf2024-1._domainkey`. The HQ agent spec gains section 17: staff chat, adding work, revising a wrong brief, and client conversations by email and Slack, with build steps 17–23.
- **Why** — Staff need to talk to the agent and run HQ from a chat. Clients need to send work to `magic@abra-ca-dabra.app` or Slack and get a reply.
- **Code touchpoints** — `docs/hq-agent-spec.md` (sections 2.2, 15, 16, 17, 18). DNS on zone `abra-ca-dabra.app`. No code.
- **Data-flow impact** — none yet. Mail to the apex now reaches Cloudflare. With no routing rule, it is not delivered anywhere. The `magic@` rule to `handoff-agent` waits for the `email()` handler in step 22.
- **API / schema impact** — none yet. Planned: wake reason `brief_changed`, migration `0009_conversations.sql` (`work_requests`, `slack_channel_links`), routes `/api/hq-chat/token` and `/api/hq-tools`, classes `HqChat` and `ClientDesk`.
- **Verification** — the Email Routing API reports `enabled: true`, `status: ready`. `dig @1.1.1.1` returns the three MX records, the new SPF, and the DKIM key. The old SPF record was removed first so the apex has one SPF record.

## 2026-10-07

- **What changed** — Sending, resending, or removing a person stays on the people form when the session cannot see the space. Invite and resend links use the client host. A Worker email send with no message id is treated as refused. The session cookie is read before the database opens.
- **Why** — A Strongfoam invite landed on the 404 page and never sent mail. A link built from the staff host opens `/invites`, which that host does not serve.
- **Code touchpoints** — `handoff/src/app/w/[slug]/people/actions.ts`, `handoff/src/lib/current.ts`, `handoff/src/lib/share-link.ts`, `handoff/src/lib/mail.ts`
- **Data-flow impact** — `invitePersonAction` returns "Sign in again to do that." instead of `notFound()` when the space is missing for the caller. `createInvite` and `resendInvite` receive `publicClientOrigin`. `openSession` keeps the cookie token across the D1 await. `sendHandoffMail` throws "mail was refused" when the binding returns no `messageId`, and the invite row is still deleted.
- **API / schema impact** — none.
- **Verification** — `npm test` in `handoff/` passed 378 node tests and 6 agent tests. `npx eslint` on the touched files exited 0. Both live workers already have the `HANDOFF_FROM_EMAIL` secret. Worker `handoff` version `e1a09ca2-e533-4bad-80e0-e206e58cde96`. Worker `handoff-hq` version `e06d0732-b032-4d96-9950-120a7521d174`.

## 2026-10-07

- **What changed** — A brief approval plans one task and one draft per piece. A `work` wake runs one skill step, writes the result on the draft, and schedules the next step a minute later. A plan step writes `build-brief.md` and moves the task to build. A finished complete-only task is marked done and stays a draft.
- **Why** — The agent needs a record of which skill runs next before a later step starts a cloud agent.
- **Code touchpoints** — `handoff/src/lib/client-plan.ts`, `handoff/src/db/agent-work.ts`, `handoff/src/agent/worker.ts`
- **Data-flow impact** — `brief_approved` still drafts the design system, then creates tasks. `work` loads one skill file from bucket `handoff-skills` and stores the step on `tasks.skills_json`. The task links to its draft through `tasks.deliverable_id`.
- **API / schema impact** — none. `create_task` now stores `deliverable_id`. A skill step writes activity `agent.skill_done`. A plan note writes activity `agent.plan_written`.
- **Verification** — `npm test` in `handoff/` passed 373 node tests and 6 agent tests. `npx eslint` on the touched files exited 0.

## 2026-10-07

- **What changed** — Invite and sign-in links no longer expire after 15 minutes. The email no longer says they do. A link ends when someone presses the button once.
- **Why** — A person can open the invite later. The 15 minute clock was turning a good link into a dead one.
- **Code touchpoints** — `handoff/src/lib/session.ts`, `handoff/src/lib/email-templates.ts`, `handoff/src/lib/policy/limits.ts`
- **Data-flow impact** — `consumeMagicLink` no longer checks a clock. One use still marks the link used.
- **API / schema impact** — none. The stored end time is a far date so the required column stays filled.
- **Verification** — `npx vitest run src/lib/email-templates.test.ts src/lib/mail.test.ts src/lib/session.test.ts src/lib/store/invites.test.ts` passed 23 tests. `npx eslint` on the touched files exited 0. Worker `handoff` version `7678a518-4d4a-4e04-9ba0-f1f650fd8937`. Worker `handoff-hq` version `106d2324-b6ef-4cb9-af11-b66847695a18`.

## 2026-10-07

- **What changed** — Product mail shows the sender name Abra-ca-dabra Ai. The address stays `magic@abra-ca-dabra.app`.
- **Why** — The inbox should name the studio, and the secret stays a bare address.
- **Code touchpoints** — `handoff/src/lib/mail.ts`, `handoff/src/lib/mail.test.ts`
- **Data-flow impact** — `sendHandoffMail` adds the name. The Worker binding uses `email`. The REST send uses `address`.
- **API / schema impact** — none.
- **Verification** — `npx vitest run src/lib/email-templates.test.ts src/lib/mail.test.ts src/lib/session.test.ts src/lib/store/invites.test.ts` passed 22 tests. `npx eslint src/lib/mail.ts src/lib/mail.test.ts` exited 0. Worker `handoff` version `b7439d65-0741-4201-8ad6-a90d1ec44b32`. Worker `handoff-hq` version `df60b8a1-bfa9-4e4d-af19-2380ab3b4fc3`.

## 2026-10-07

- **What changed** — The invite card uses the Abracadabra studio colors and type. The button is the orange accent. The heading is Tektur. The body is IBM Plex Sans.
- **Why** — Outbound invite mail should match the studio site, not a separate card style.
- **Code touchpoints** — `handoff/src/lib/email-templates.ts`, `handoff/src/lib/brand/studio.ts`
- **Data-flow impact** — none. The same invite still has one link. Sign-in mail stays plain text.
- **API / schema impact** — none.
- **Verification** — `npx vitest run src/lib/email-templates.test.ts src/lib/mail.test.ts src/lib/session.test.ts src/lib/store/invites.test.ts` passed 21 tests. `npx eslint src/lib/email-templates.ts src/lib/email-templates.test.ts` exited 0.

## 2026-10-07

- **What changed** — An invite email is a dark HTML card with one button, plus the same words in plain text. The subject names the space.
- **Why** — Invite mail should look like Handoff. The link still opens a page, and the person still presses Sign in.
- **Code touchpoints** — `handoff/src/lib/email-templates.ts`, `handoff/src/lib/session.ts`, `handoff/src/lib/mail.ts`, `handoff/src/lib/store/invites.ts`
- **Data-flow impact** — `createInvite` and `resendInvite` compose the card. Sign-in mail that is not an invite stays plain text. `sendHandoffMail` sends `html` only when the message has it.
- **API / schema impact** — none.
- **Verification** — `npx vitest run src/lib/email-templates.test.ts src/lib/mail.test.ts src/lib/session.test.ts src/lib/store/invites.test.ts` passed 21 tests.

## 2026-10-07

- **What changed** — Product mail sends from `magic@abra-ca-dabra.app`. That address is a Worker secret on `handoff` and `handoff-hq`.
- **Why** — Client mail from the app uses the agent mailbox.
- **Code touchpoints** — `handoff/README.md`, `handoff/.env.example`, `handoff/src/lib/runtime/production-env.test.ts`
- **Data-flow impact** — `sendHandoffMail` still reads `HANDOFF_FROM_EMAIL`. Sign-in and invite mail use the new address. The scan worker does not use this secret.
- **API / schema impact** — none. The value is a Worker secret, not a git file.
- **Verification** — Secret list on both workers includes `HANDOFF_FROM_EMAIL` after the secret update. `npm test -- src/lib/runtime/production-env.test.ts` passed.

## 2026-10-07

- **What changed** — Product mail sends from `handoff@abra-ca-dabra.app`. That address is a Worker secret on `handoff` and `handoff-hq`.
- **Why** — Email Sending is onboarded for `abra-ca-dabra.app`. Invite and file mail need a From address on that domain.
- **Code touchpoints** — `handoff/README.md`, `handoff/.env.example`
- **Data-flow impact** — `sendHandoffMail` reads `HANDOFF_FROM_EMAIL` and sends through the `EMAIL` binding. The scan worker does not use this secret.
- **API / schema impact** — none. The value is a Worker secret, not a git file.
- **Verification** — Secret list on both workers includes `HANDOFF_FROM_EMAIL` after deploy. Public DNS at 1.1.1.1 shows bounce SPF `include:_spf.mx.cloudflare.net`, bounce MX, and a DKIM key on `cf-bounce._domainkey`. `npm run deploy` published worker `handoff` version `5c9e8ebb-69a2-462e-b827-eadbd67ea89a`. `npm run deploy:hq` published worker `handoff-hq` version `dbcaac9d-111b-4877-a33e-5027498d2e2f`.

## 2026-10-07

- **What changed** — The production type check covers brief and design-system labels, skill choices stay `plan` or `complete`, and a GET of an open link still returns 405 when the request is present.
- **Why** — Workers Builds for `handoff` and `handoff-hq` stopped on commit `4942d42` during `npm run build`.
- **Code touchpoints** — `handoff/src/app/deliverables/labels.ts`, `handoff/src/lib/client-documents.ts`, `handoff/src/lib/client-documents.test.ts`, `handoff/src/lib/mcp.ts`, `handoff/src/lib/agent-wake.test.ts`, `handoff/src/app/auth/callback/open/route.ts`, `handoff/src/app/share/[token]/open/route.ts`, `handoff/src/scan/bindings.test.ts`
- **Data-flow impact** — none. A visit still does not sign anyone in or open a folder.
- **API / schema impact** — none.
- **Verification** — `npm test` passed 357 node tests and 6 agent tests. `npm run build` passed.

## 2026-10-07

- **What changed** — A share link and a magic link open a confirm page. The folder opens, and the person signs in, only when they press the button. The email text tells them to press that button. The link URL is unchanged.
- **Why** — Mail scanners open a link with a GET. That used to sign a guest in or use up a one-time sign-in link before the person arrived.
- **Code touchpoints** — `handoff/src/app/share/[token]/page.tsx`, `handoff/src/app/share/[token]/open/route.ts`, `handoff/src/app/auth/callback/page.tsx`, `handoff/src/app/auth/callback/open/route.ts`, `handoff/src/lib/session.ts`, `handoff/src/app/share/[token]/route.test.ts`, `handoff/src/app/auth/callback/route.test.ts`, `handoff/src/lib/session.test.ts`, `handoff/.env.example`
- **Data-flow impact** — GET `/share/[token]` and GET `/auth/callback` render a button and do not write a session. POST `/share/[token]/open` and POST `/auth/callback/open` do the old work. A GET of either open URL returns 405.
- **API / schema impact** — none. `HANDOFF_FROM_EMAIL` is still unset. Email Sending for `abra-ca-dabra.app` is not onboarded. Public DNS is SPF `v=spf1 -all`, DMARC `p=reject`, and an empty DKIM key. The local API token can list the zone and cannot call Email Sending or DNS.
- **Verification** — `npm test` passed (357 node tests, 6 agent tests). `npx eslint` passed on the share page, the sign-in page, both open routes, `src/lib/session.ts`, and their tests. Email Sending was not onboarded: the API token can list the zone and returns authentication error 10000 for Email Sending and DNS.

## 2026-10-07

- **What changed** — Worker `handoff-scan` is deployed and can run the ClamAV container. The container reads D1 and R2 through `http://handoff.d1` and `http://handoff.r2`. Those hosts are answered by the Worker bindings. A cron every two minutes fetches `/health`. `/health` has not yet reported `clamd: true`, so a finished upload can still stay `uploaded`.
- **Why** — A Worker isolate cannot run `clamd`. Clients will upload files, and only a live scan process can move a file out of `uploaded`.
- **Code touchpoints** — `handoff/scan-container.ts`, `handoff/wrangler.scan.jsonc`, `handoff/src/scan/bindings.ts`, `handoff/src/db/http.ts`, `handoff/src/db/open.ts`, `handoff/src/lib/store/remote.ts`, `handoff/src/lib/store/objects.ts`, `handoff/worker/start.sh`, `handoff/worker/wait-clamd.mjs`, `handoff/.dockerignore`, `handoff/package.json`
- **Data-flow impact** — The scan loop is unchanged. In the container it claims one `uploaded` file, reads the object, and writes `clean`, `rejected`, `held`, or a retry. Production still exits when `clamd` does not answer.
- **API / schema impact** — none. New Worker config. No D1 migration.
- **Verification** — `npm test` passed (353 node tests, 6 agent tests). `npx eslint` passed on the scan files. `npm run deploy:scan` deployed worker `handoff-scan` (version `c071514e-7206-4198-9a46-c930a3f9cac6`, container application `a036214f-ce8e-42ac-8c7c-4216d905f9e0`). The first image push dropped the registry connection; the retry succeeded. EICAR, a 1 GB file, and an archive-limit hold were not checked.

## 2026-10-07

- **What changed** — An `onboard` or `context_changed` wake drafts a brief from the client's context and file summaries. A `context_changed` wake that already has a brief, and a `brief_approved` wake, also draft the design system. The brief lists real `.cursor/skills` paths for each piece, marked complete or plan, so a later Cursor run knows which skills to follow.
- **Why** — Cursor should not guess which skills apply. The brief is the place those paths are written down.
- **Code touchpoints** — `handoff/src/lib/client-documents.ts`, `handoff/src/lib/client-documents.test.ts`, `handoff/src/agent/worker.ts`, `docs/hq-agent-spec.md`, `handoff/README.md`
- **Data-flow impact** — Those wake reasons call `client_context`, `list_files`, and `search_files`, then `save_brief`. A blocking gap becomes `ask_staff`. A clean brief posts an internal status update. A missing `brief-writing` skill writes `add_note` and still saves the brief. The home page is fetched once for a public website and cached for 24 hours.
- **API / schema impact** — none
- **Verification** — `npm test` passed (344 node tests, 6 agent tests). `npx eslint` passed on `src/lib/client-documents.ts`, `src/lib/client-documents.test.ts`, and `src/agent/worker.ts`.

## 2026-10-06

- **What changed** — Worker `handoff-agent` accepts a signed wake, keeps one open wake per reason, and reads the skill index from R2. The first wake connects to the MCP portal with the Access service-token headers.
- **Why** — Each client needs its own agent instance before the brief and build loop can run. The portal is the only front door for tools.
- **Code touchpoints** — `handoff/src/agent/worker.ts`, `handoff/src/agent/worker.test.ts`, `handoff/wrangler.agent.jsonc`, `handoff/vitest.agent.config.mts`, `handoff/vitest.config.ts`, `handoff/tsconfig.json`, `handoff/.env.example`
- **Data-flow impact** — `POST /wake` on `handoff-agent` checks `x-handoff-signature`, then `ClientAgent.acceptWake`. A second wake with the same reason still open returns 202. Tool names come from the portal. `organizationId` on a Handoff call is the Durable Object name.
- **API / schema impact** — New worker config. No D1 change. Production `MCP_PORTAL_URL` is empty until the portal exists.
- **Verification** — `npm test` passed (333 node tests, 6 agent tests). `npx eslint` passed on `src/agent/worker.ts` and `src/agent/worker.test.ts`.

## 2026-10-06

- **What changed** — Worker `handoff` wakes the HQ agent on a schedule. Every 15 minutes covers a client with open work or new files. Every hour covers a client with a cloud run still open. Monday at 08:00 UTC covers every live client. The POST is signed. A failed call is recorded and tried again next cycle.
- **Why** — One agent instance per client has to be told when something is waiting. A paused or archived client stays quiet.
- **Code touchpoints** — `handoff/src/lib/agent-wake.ts`, `handoff/src/lib/agent-wake.test.ts`, `handoff/cloudflare-worker.ts`, `handoff/wrangler.jsonc`, `handoff/.env.example`
- **Data-flow impact** — Cron on `handoff` reads organizations, tasks, activities, and cloud runs, then POSTs `{ organizationId, reason, sentAt }` to `AGENT_URL/wake` with header `x-handoff-signature`. A non-2xx response writes `agent.wake_failed`.
- **API / schema impact** — New crons: `*/15 * * * *`, `0 * * * *`, `0 8 * * 1`. New var `AGENT_URL`. Secret `AGENT_WAKE_SECRET` is set on the worker, not in git.
- **Verification** — `npm test` passed (333 tests). `npx eslint` passed on `src/lib/agent-wake.ts` and `src/lib/agent-wake.test.ts`.

## 2026-10-06

- **What changed** — A deployment key with `work` scope can save a brief, create and update tasks, add a deliverable, ask staff, post a status update, add a note, and list this client's repos. A repeat of the same `requestId` returns the first result. A project or task in another organization is refused and writes nothing. Moving a task to engineer does not start a cloud run.
- **Why** — The HQ agent writes as itself. Staff tools stay staff-only. The build gate and Cursor stay for a later step.
- **Code touchpoints** — `handoff/src/db/agent-work.ts`, `handoff/src/lib/mcp.ts`, `handoff/src/lib/deliverable-manifest.ts`, `handoff/src/lib/knowledge.test.ts`
- **Data-flow impact** — `POST /api/mcp` with a deployment key writes deliverables, tasks, activities, status updates, and agent questions for the named organization. `actor_kind` is `agent`. Internal status updates publish immediately. Client updates stay drafts.
- **API / schema impact** — Work tools: `save_brief`, `create_task`, `update_task`, `create_deliverable`, `add_deliverable_item`, `post_status_update`, `add_note`, `ask_staff`, `list_repos`. Deliverable kinds now include `brief` and `design_system` in the app constant, matching the database. A key without `work` still gets `-32001`.
- **Verification** — `npm test` passed (329 tests). `npx eslint` passed on the edited files.

## 2026-10-06

- **What changed** — A deployment key can read one live client's context, brief, and feedback. A project key still searches only its own space. Survey answers stay in the database. A project key cannot name another organization or call a work tool.
- **Why** — The HQ agent needs that picture before it writes a brief. The same portal key is shared, so the organization id on the call is what keeps clients apart.
- **Code touchpoints** — `handoff/src/lib/mcp.ts`, `handoff/src/lib/agent-context.ts`, `handoff/src/lib/knowledge.ts`, `handoff/src/lib/knowledge.test.ts`
- **Data-flow impact** — `POST /api/mcp` with a deployment key reads organizations, deals, assessments (scores only), projects, spaces, repos, briefs, tasks, staff instructions, and agent questions. `list_files` and `search_files` can take a file tag.
- **API / schema impact** — New tools: `client_context`, `get_brief`, `list_feedback`. Work tool names return JSON-RPC `-32001` when the key has no `work` scope. An unknown or archived organization returns `-32602`.
- **Verification** — `npm test` passed (326 tests).

## 2026-10-06

- **What changed** — The database can store agent task stages, briefs, design systems, cloud runs, and staff questions. Existing deliverables and tasks keep their rows. A project key still names one space. A deployment key with `work` scope and no organization is the agent.
- **Why** — The HQ agent needs those records before it can write a brief or start a build. A client with no GitHub repo will get one created when a task enters build; that behavior is specified and not wired yet.
- **Code touchpoints** — `handoff/migrations/0007_agent.sql`, `handoff/src/db/migration-sql.ts`, `handoff/src/db/migrate.ts`, `handoff/src/db/migrate.test.ts`, `handoff/src/lib/knowledge.ts`, `handoff/src/lib/knowledge.test.ts`
- **Data-flow impact** — none yet. No route reads the new tables.
- **API / schema impact** — `tasks` gains `stage`, `deliverable_id`, `cursor_agent_id`, `build_deadline_at`, `skills_json`, `blocked_reason`, `round`, `created_by_kind`. `deliverables.kind` accepts `brief` and `design_system`. `organizations` gains `brief_approval`, `auto_publish_built`, `agent_paused_at`. `knowledge_keys.organization_id` is added. New tables: `agent_questions`, `cloud_runs`, `agent_settings` (`max_cloud_runs` 4, `build_deadline_hours` 2), `deliverable_notices`.
- **Verification** — `npm test` passed (323 tests).

## 2026-10-06

- **What changed** — Staff can add finished work on a project, send a round to the client, and pull a round from a repo manifest. The client gallery is `/w/[slug]/work`. Approve and ask-for-changes stay on the sent round.
- **Why** — HQ gameplan step 7. The tables were already in `0005_crm.sql`. A sent round now keeps its own version so a later draft does not hide it.
- **Code touchpoints** — `handoff/migrations/0006_deliverable_rounds.sql`, `handoff/src/db/deliverables.ts`, `handoff/src/lib/deliverable-manifest.ts`, `handoff/src/lib/github/contents.ts`, `handoff/src/app/deliverables/[id]/page.tsx`, `handoff/src/app/w/[slug]/work/page.tsx`, `handoff/src/app/api/deliverables/[deliverableId]/items/[itemId]/media/[role]/route.ts`
- **Data-flow impact** — Pull reads only the manifest and the files it lists from GitHub, stores those bytes in R2, then writes the round. The gallery and the media route read the sent version for a client and the working version for staff.
- **API / schema impact** — `deliverables.published_version`. `GET /api/deliverables/[deliverableId]/items/[itemId]/media/[role]` returns the bytes when the caller can see that piece.
- **Verification** — `npm test` passed (321 tests). `npm run lint` and `npx tsc --noEmit` passed. On local HQ, `/w/strongfoam/work` shows Finished work and "Nothing to look at yet." There is no local project, so the builder form was not clicked. Not deployed.

## 2026-10-06

- **What changed** — Staff who can see a space can upload files there from HQ, including Renew Implants. The Upload button shows for an admin and for staff assigned to that space. People in the folder can still upload. Someone who cannot see the space still cannot.
- **Why** — The space page only offered Upload to people with a folder membership, and starting an upload checked that same membership. Signed-in staff on HQ could open the space and could not add files.
- **Code touchpoints** — `handoff/src/lib/authz.ts`, `handoff/src/lib/authz.test.ts`, `handoff/src/lib/store/batches.ts`, `handoff/src/lib/store/uploads.ts`, `handoff/src/app/w/[slug]/page.tsx`, `handoff/src/app/w/[slug]/drop/page.tsx`, `handoff/src/app/api/workspaces/[slug]/batches/route.test.ts`, `handoff/README.md`
- **Data-flow impact** — Upload still posts a file list to `POST /api/workspaces/[slug]/batches`, then sends bytes through the same grant and complete steps. Staff do not need an open file request. A client still needs one.
- **API / schema impact** — `batch.create` is allowed for an admin and an assigned operator on that space. No schema change.
- **Verification** — `npx vitest run src/lib/authz.test.ts src/app/api/workspaces/[slug]/batches/route.test.ts src/app/api/batches/[batchId]/files/[fileId]/route.test.ts` passed (37 tests). `npm run lint` and `npx tsc --noEmit` passed. Staff deploy version `47b647b4-1113-4e3e-b32f-76a6c157010e` is live on `handoff-hq`. Signed-in upload on Renew Implants was not clicked in a browser.

## 2026-10-06

- **What changed** — Worker `handoff-hq` version `9b451689-6d56-454c-b9da-2e8d2970cf33` is live. `/w` on `hq.abra-ca-dabra.app` is no longer blocked by the plain-text host gate.
- **Why** — The previous staff deploy was older than the change that lets staff open a space on the staff host.
- **Code touchpoints** — none (deploy of the current tree)
- **Data-flow impact** — A signed-in staff member who can see the space gets the space page. A request with no session gets the normal Next missing page.
- **API / schema impact** — none
- **Verification** — `curl` on 2026-10-06 for `/w/strongfoam` and `/w/rewnewimplants`: HTTP/2 404, `content-type: text/html`, `x-opennext: 1`. Neither body contains "This page is not here."

## 2026-10-06

- **What changed** — `npm run build` is `next build` again. Deploy scripts still run `opennextjs-cloudflare build`, then deploy.
- **Why** — OpenNext runs `npm run build` while it builds. When that script was OpenNext, `npm run deploy:hq` called itself and printed the same banner until it was stopped.
- **Code touchpoints** — `handoff/package.json`, `handoff/src/lib/runtime/workers-build.test.ts`, `handoff/README.md`
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — `npx vitest run src/lib/runtime/workers-build.test.ts` passed (3 tests).

## 2026-10-06

- **What changed** — `hq.abra-ca-dabra.app` is attached to worker `handoff-hq`.
- **Why** — That hostname was still answering from Vercel. Wrangler is signed in on the Abracadabra account, so the custom domain could be attached.
- **Code touchpoints** — `handoff/README.md`
- **Data-flow impact** — `https://hq.abra-ca-dabra.app/login` is served by worker `handoff-hq`.
- **API / schema impact** — none
- **Verification** — `curl -sI https://hq.abra-ca-dabra.app/login` on 2026-10-06: HTTP/2 200, `x-opennext: 1`, no `x-vercel-error`.

## 2026-10-06

- **What changed** — The Readiness Check host is Cloudflare. The staff host `hq.abra-ca-dabra.app` is the hostname that still reaches Vercel.
- **Why** — No public host on `abra-ca-dabra.app` is supposed to stay on Vercel.
- **Code touchpoints** — `handoff/README.md`, `docs/source-of-truth.md`
- **Data-flow impact** — `https://check.abra-ca-dabra.app/check` answers from a Worker. `https://hq.abra-ca-dabra.app` still returns Vercel `DEPLOYMENT_NOT_FOUND`.
- **API / schema impact** — none
- **Verification** — `curl -sI` on 2026-10-06: check `/check` is HTTP/2 200 with `x-opennext: 1`. Apex and `www` have `server: cloudflare` and no `x-vercel-id`. `hq` `/login` is HTTP/2 404 with `x-vercel-error: DEPLOYMENT_NOT_FOUND`.

## 2026-10-06

- **What changed** — A copied share link uses `https://handoff.abra-ca-dabra.app/share/[token]`. A staff host and a workers.dev host do not become that link. Worker `handoff` sets `HANDOFF_APP_ORIGIN` to that client origin.
- **Why** — Opening a space on the staff host or the workers.dev preview copied a share URL that does not answer there.
- **Code touchpoints** — `handoff/src/lib/share-link.ts`, `handoff/src/lib/share-link.test.ts`, `handoff/src/lib/host.ts`, `handoff/wrangler.jsonc`, `handoff/.env.example`, `handoff/README.md`
- **Data-flow impact** — Share links resolve to the client custom domain. Space links stay on the current host.
- **API / schema impact** — none
- **Verification** — pending

## 2026-10-06

- **What changed** — Staff can open a space at `/w/[slug]` on the staff host. Space names, client names, and work filters are shadcn buttons and badges. The sidebar shows icons and a menu button on every staff page, including a space.
- **Why** — Spaces linked to `/w/rewnewimplants` on the staff host, and that host answered "This page is not here." The staff lists were plain links, so the component library did not show up on the pages people use.
- **Code touchpoints** — `handoff/src/lib/host.ts`, `handoff/src/lib/host.test.ts`, `handoff/src/app/admin/page.tsx`, `handoff/src/app/staff-shell.tsx`, `handoff/src/app/staff-nav.tsx`, `handoff/src/app/w/[slug]/layout.tsx`, `handoff/src/components/ui/card.tsx`, `handoff/README.md`
- **Data-flow impact** — Staff space links stay on the staff host. Share and invite pages stay client-only.
- **API / schema impact** — none
- **Verification** — `npx vitest run src/lib/host.test.ts src/app/staff-nav-match.test.ts` passed (9 tests). `npm run lint` passed. `npx tsc --noEmit` passed. On `http://hq.localhost:3000`, sign-in uses the card and the orange button. Spaces shows the sidebar, outline buttons, and badges. Strongfoam opens `/w/strongfoam` with the sidebar still visible. Share pages on the staff host still return "This page is not here." The live staff host still serves the old block until this build is deployed.

## 2026-10-06

- **What changed** — `npm run build` runs `opennextjs-cloudflare build`. Workers Builds leaves the build command empty. The deploy command is `npm run deploy` for `handoff` and `npm run deploy:hq` for `handoff-hq`.
- **Why** — Those scripts already build, then deploy. The default `npx wrangler deploy` calls OpenNext deploy and skips the build, so deploy exits with "Could not find compiled Open Next config".
- **Code touchpoints** — `handoff/package.json`, `handoff/src/lib/runtime/workers-build.test.ts`, `handoff/README.md`
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — `npx vitest run src/lib/runtime/workers-build.test.ts`

## 2026-10-06

- **What changed** — Staff pages use a shadcn sidebar, separator, badge, label, and textarea on the existing canvas, ink, optic, and phosphor colors. Product mail (magic links, invites, and file notices) sends through Cloudflare Email Service. Workers `handoff` and `handoff-hq` bind `EMAIL`. The scan worker posts to the Email Service REST API with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- **Why** — The staff chrome should use the component library without replacing the Abracadabra palette. Product mail should use the Cloudflare sender already planned for client conversation mail.
- **Code touchpoints** — `handoff/src/app/staff-shell.tsx`, `handoff/src/app/staff-nav.tsx`, `handoff/src/components/ui/sidebar.tsx`, `handoff/src/components/ui/sheet.tsx`, `handoff/src/components/ui/tooltip.tsx`, `handoff/src/components/ui/skeleton.tsx`, `handoff/src/hooks/use-mobile.ts`, `handoff/src/app/globals.css`, `handoff/src/lib/mail.ts`, `handoff/src/lib/runtime/production-env.ts`, `handoff/wrangler.jsonc`, `handoff/wrangler.hq.jsonc`, `handoff/.env.example`
- **Data-flow impact** — `sendHandoffMail` prefers the Worker `EMAIL` binding. Without that binding it uses the REST send API. With neither, it throws `mail is not configured`. Callers are the magic-link action, space invites, and the scan notification job.
- **API / schema impact** — none. `PRODUCTION_SECRET_KEYS` is now `HANDOFF_FROM_EMAIL`. `RESEND_API_KEY` is no longer part of the contract.
- **Verification** — `npm test` passed (61 files, 308 tests). `npm run lint` passed. `npx next typegen` then `npx tsc --noEmit` passed. In the browser at `http://hq.localhost:3000/login`, the page uses canvas `#070706`, ink text, optic wordmark, and the orange primary button. Show password switches the field to text. `/spaces` redirects to `/login`. The staff sidebar was not opened because `HANDOFF_ADMIN_PASSWORD` is not set in this environment. Live mail was not sent. The domain still needs Cloudflare Email Service onboarding before `HANDOFF_FROM_EMAIL` can deliver.

## 2026-10-06

- **What changed** — Deployed `main` after the hostname cutover. Marketing Worker `abracadabra-marketing` is version `efc2764d-ddf2-4489-9eda-86778e21908b`. Client worker `handoff` is version `fa3dce27-fb33-4e3e-bac3-5e5aecb11b5d`. Staff worker `handoff-hq` is version `9c6d6b97-35ef-4e02-bce8-8525dc1e3d75`.
- **Why** — The custom domains were already attached. This deploy publishes the `main` scripts onto those hosts.
- **Code touchpoints** — none in this commit beyond the record. The scripts came from the merge of #50.
- **Data-flow impact** — none. Secrets stayed in place. Plain origins stayed `https://hq.abra-ca-dabra.app` and `https://handoff.abra-ca-dabra.app`.
- **API / schema impact** — none.
- **Verification** — Through Cloudflare anycast `104.21.74.23`: apex HTTP/2 200, `server: cloudflare`, no `x-vercel-id`. `www` `/films.html?from=www` HTTP/2 308 to the apex with the query. `check` `/check` HTTP/2 200 with `x-vercel-id`. Client `/api/health` HTTP/2 200 `{"database":"d1","ok":true,"visible":0}`. Client `/clients` HTTP/2 404 "This page is not here." Staff `/spaces` HTTP/2 307 `location: /login`. Marketing preview HTTP/2 200 with `x-robots-tag: noindex`.

## 2026-10-06

- **What changed** — The agency dashboard gameplan matches the two live workers and the custom domains. Staff are `handoff-hq` at `https://hq.abra-ca-dabra.app`. Clients are `handoff` at `https://handoff.abra-ca-dabra.app`. They share D1 and R2. The skill-library notes say the Cloudflare agent is step 10 and that worker is not built yet. Client and project routes include linked repos.
- **Why** — The hostname cutover and the hub-doc pass both needed to land together. The earlier hub pass still described the workers.dev staff host as the public door.
- **Code touchpoints** — `docs/agency-dashboard-gameplan.md`, `README.md`, `.cursor/skills/README.md`
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — docs only. No app code change.

## 2026-10-06

- **What changed** — The client Worker custom domain is `handoff.abra-ca-dabra.app`. The staff Worker custom domain is `hq.abra-ca-dabra.app`. The apex stays on marketing Worker `abracadabra-marketing`. `check.abra-ca-dabra.app` stays the Readiness Check on Vercel. `www` 308s to the apex and is not a Worker hostname.
- **Why** — The zone is on this Cloudflare account. The client config used to claim `hq`, so a later client deploy would steal the staff host.
- **Code touchpoints** — `handoff/wrangler.jsonc`, `handoff/wrangler.hq.jsonc`, `handoff/src/lib/host.ts`, `handoff/.env.example`, `scrollcraft/builds/abracadabra-ai/wrangler.jsonc`
- **Data-flow impact** — `HANDOFF_HQ_ORIGIN` is `https://hq.abra-ca-dabra.app`. `HANDOFF_APP_ORIGIN` is `https://handoff.abra-ca-dabra.app`. The workers.dev staff host still counts as HQ. The Readiness Check still posts to the client workers.dev origin.
- **API / schema impact** — none.
- **Verification** — `node --test tests/cloudflare-deploy.test.mjs` in the marketing folder passed. `npx vitest run src/lib/host.test.ts` in `handoff/` passed (6). Full `npm test`, lint, and `tsc` were not re-run; the host change is a comment. Live, through Cloudflare anycast `104.21.74.23`: `https://abra-ca-dabra.app/` HTTP/2 200, `server: cloudflare`, no `x-vercel-id`, title "Abra-ca-dabra: From thought to working software". `https://www.abra-ca-dabra.app/films.html?from=www` HTTP/2 308 to `https://abra-ca-dabra.app/films.html?from=www`. `https://check.abra-ca-dabra.app/check` HTTP/2 200 with `x-vercel-id` present (still Vercel). `https://handoff.abra-ca-dabra.app/api/health` HTTP/2 200 `{"database":"d1","ok":true,"visible":0}`. `https://handoff.abra-ca-dabra.app/clients` HTTP/2 404 "This page is not here." `https://hq.abra-ca-dabra.app/spaces` HTTP/2 307 `location: /login`. Marketing preview `https://abracadabra-marketing.abracadabra-ai.workers.dev/` HTTP/2 200 with `x-robots-tag: noindex`. Client worker version `f6234783-9a73-459e-87a1-25e5b916639b`. Staff worker version `6ea04373-5866-45c2-bfd9-65cb4d9ad84b`.

## 2026-10-06

- **What changed** — Staff can link a GitHub repo to a client and to a project. An admin opens `/settings/github` to see the installs this app can see. `POST /api/github/webhook` checks `X-Hub-Signature-256`, then puts the delivery on queue `github-events`. The client worker writes a timeline row for an opened or merged pull request, a release, a deploy, or a push to the default branch.
- **Why** — Step 6 of the agency dashboard. Client repos live in our GitHub org, and the client record should show that work.
- **Code touchpoints** — `handoff/src/lib/github/`, `handoff/src/lib/queue-dispatch.ts`, `handoff/src/app/api/github/webhook/route.ts`, `handoff/src/app/settings/github/page.tsx`, `handoff/src/app/clients/repo-actions.ts`, `handoff/src/app/clients/repo-forms.tsx`, `handoff/src/db/crm.ts`, `handoff/cloudflare-worker.ts`, `handoff/wrangler.jsonc`, `handoff/wrangler.hq.jsonc`
- **Data-flow impact** — The staff worker only produces `github-events`. The client worker consumes it. A delivery id is stored in `intake_receipts` with source `github`. Activities use kinds `pr_opened`, `pr_merged`, `release`, `deploy`, and `push`.
- **API / schema impact** — No new migration. The tables already live in `0005_crm.sql`. Env `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` on both workers.
- **Verification** — `npm test` (303 passed), `npm run lint`, and `npx tsc --noEmit` in `handoff/`. On `hq.localhost`, sign-in stays on `/spaces`. The sidebar includes Settings. `/settings/github` says "Not connected" when the app id, private key, and webhook secret are unset. A client page shows "Repos we work in for this client.", "GitHub is not connected yet. An admin can connect it in Settings.", and "No repos linked yet." A project page shows "Code we work on for this project." and "No repos linked yet." Those local rows were removed after the check. Queues `github-events` (2 producers, 1 consumer) and `github-events-dlq` exist. Both workers were deployed from `main`. The client deploy still stops on custom-domain error 10082 after the script uploads. The client worker version is `9edc9f6e-e382-4370-807e-7f8bad971739`. The staff worker version is `b6e7827f-ebb6-4f8e-aad0-9232bd4508bb`. Live: unsigned staff `/settings/github` matches `/clients` (404). The client host `/settings/github` and `POST /api/github/webhook` say "This page is not here." A staff webhook with no signature returns 401 `{"error":"Bad signature."}`. `GET /api/health` on the client host is ok.

## 2026-10-06

- **What changed** — Staff pages use a sidebar: Today, Leads, Clients, Work, and Spaces. Today is `/` on the staff host. Open work is `/work`. A project page at `/projects/[id]` lists milestones, tasks, and status updates. A client page lists that company's projects. Publishing a client update does not send mail.
- **Why** — Step 5 of the agency dashboard. The top link row was in the way, and projects, tasks, and the day view were the next useful screens.
- **Code touchpoints** — `handoff/src/app/staff-shell.tsx`, `handoff/src/app/staff-nav.tsx`, `handoff/src/app/page.tsx`, `handoff/src/app/work/`, `handoff/src/app/projects/`, `handoff/src/app/today-screen.tsx`, `handoff/src/db/crm.ts`, `handoff/src/app/clients/[id]/page.tsx`, `docs/agency-dashboard-gameplan.md`
- **Data-flow impact** — Projects, milestones, tasks, and status updates use the tables from `0005_crm.sql`. A published update sets `published_at` and leaves `emailed_at` null. Today reads deals still in `new`, calls in the next 7 days, tasks due or late, deals with no next step, open requests, invoices due, and agent notes from the last 7 days.
- **API / schema impact** — none. No new migration.
- **Verification** — `npm test` (273 passed), `npm run lint`, and `npx tsc --noEmit` in `handoff/`. On `hq.localhost`, the sidebar lists Today, Leads, Clients, Work, and Spaces. Today, the leads board, a client page, Work, and a project page all use it. A project, a milestone, and a task were added. The task moved to Doing and showed on Today and on Work. A client update saved as a draft, then published, and `emailed_at` stayed empty. Those local rows were removed after the check. The client host home has no staff sidebar. `/leads` and `/work` on the client host say "This page is not here." Both workers were deployed from this branch. The client deploy still stops on custom-domain error 10082 after the script uploads. The staff worker version is `e3ae00f9-5101-4273-9ac0-9118c813614a`. Unsigned visits to the staff host `/`, `/work`, and `/projects` stay the sign-in page or the staff not-found. `/spaces` still sends an unsigned visit to `/login`.

## 2026-10-06

- **What changed** — The agent plan uses the skill library (724 procedures in `.cursor/skills/`, copied from SourceControl `skills/`) to plan and complete tasks. On wake the agent loads an index, reads one matching skill, finishes work that fits the MCP tools, and writes a plan plus a staff task when a step needs a program the Worker does not run.
- **Why** — The earlier note treated that folder as a short allowlist. The library is the source of the procedures.
- **Code touchpoints** — `docs/agency-dashboard-gameplan.md`, `README.md`, `.cursor/skills/README.md`
- **Data-flow impact** — none until step 10, when a publish step writes the index and the skill files to R2 bucket `handoff-skills`.
- **API / schema impact** — none. The agent worker is not built.
- **Verification** — docs only. No app code change.

## 2026-10-06

- **What changed** — Staff can move a deal on `/leads`. The board has one column per stage. The list filters by stage, source, and owner. Marking a deal won turns a lead or past client into a client, opens a planned project, and opens a space when that company has none. A lost move needs a short reason. The client page lists that company's deals.
- **Why** — Step 4 of the agency dashboard. A won deal should become a client, a project, and a space in one move.
- **Code touchpoints** — `handoff/src/db/crm.ts`, `handoff/src/app/leads/`, `handoff/src/app/staff-nav.tsx`, `handoff/src/app/clients/[id]/page.tsx`, `docs/agency-dashboard-gameplan.md`
- **Data-flow impact** — Stage moves write a `stage_change` activity. Won fills `projects`, and a new space uses the company name for the name, slug, and sender. A second win does not open a second project or space.
- **API / schema impact** — none. Stages stay `new`, `contacted`, `call_booked`, `proposal`, `won`, `lost`.
- **Verification** — `npm test` (257 passed), `npm run lint`, and `npx tsc --noEmit` in `handoff/`. On `hq.localhost`, a deal moved from New to Contacted and the card changed column. A lost move with no reason stayed put and said "Say why this deal was lost." The list and the client Deals card showed the same deal. The client host `/leads` says "This page is not here." Unsigned visits to the staff host `/leads` get the staff not-found, the same as `/clients`. The client deploy still stops on custom-domain error 10082 after the script uploads. The staff worker version is `407924eb-1398-477c-b81f-1f0797b5c4a3`.

## 2026-10-06

- **What changed** — A signed Readiness Check result or booking can open a lead. `POST /api/intake/assessment` and `POST /api/intake/booking` check an HMAC and a 5-minute timestamp, then put the body on queue `lead-intake` and return 202. The `handoff` worker writes the lead. A repeat assessment does nothing, except it can fill a missing email. A repeat booking with the same time does nothing. A later time updates that call.
- **Why** — Step 3 of the agency dashboard. New survey leads should land in the client list without copying old rows.
- **Code touchpoints** — `handoff/src/lib/intake/`, `handoff/src/app/api/intake/`, `handoff/cloudflare-worker.ts`, `handoff/wrangler.jsonc`, `handoff/wrangler.hq.jsonc`, `readiness-check/src/lib/handoff-intake.ts`
- **Data-flow impact** — The consumer matches email, then company domain. A free email host is not stored as the company domain. New companies are kind `lead`. The timeline actor is `system`. Bookings use provider `calcom`. A booked or moved call sets the deal to `call_booked` only from `new` or `contacted`.
- **API / schema impact** — No new migration. Env `INTAKE_SIGNING_SECRET` on both Handoff workers. The check uses `HANDOFF_INTAKE_ORIGIN` and the same secret. If either is unset, the check skips the POST.
- **Verification** — `npm test` (245 passed), `npm run lint`, and `npx tsc --noEmit` in `handoff/`. `npm test` (198 passed) and `npm run lint` in `readiness-check/`. Live: a bad signature returns 401, a signed POST returns 202, and one fake lead (`intake-check.invalid`, `intake-check@example.com`) is kind `lead`, stage `new`, source `readiness_check`. The client deploy still stops on custom-domain error 10082 after the script uploads. The staff worker deployed as a producer only. The Readiness Check project does not have these env values yet, so a finished check still skips the POST until they are set.

## 2026-10-06

- **What changed** — Staff pages also answer on `https://handoff-hq.abracadabra-ai.workers.dev`. The client worker sends old `/admin` links there.
- **Why** — `hq.abra-ca-dabra.app` is not a zone on this Cloudflare account yet. Staff need a host they can open.
- **Code touchpoints** — `handoff/src/lib/host.ts`, `handoff/src/proxy.ts`, `handoff/wrangler.jsonc`, `handoff/wrangler.hq.jsonc`
- **Data-flow impact** — none. The staff worker uses the same D1 database and R2 bucket.
- **API / schema impact** — none. `HANDOFF_HQ_ORIGIN` on the client worker is `https://handoff-hq.abracadabra-ai.workers.dev` until the zone moves.
- **Verification** — `npm test` (230 passed), `npm run lint`, and `npx tsc --noEmit` in `handoff/`. Live: staff host `/login` and `/` return 200 (Studio sign-in), `/w/strongfoam` says "This page is not here.", `/admin` goes to `/spaces`. Client host `/` and `/api/health` return 200, `/clients` says "This page is not here.", and `/admin` goes to `https://handoff-hq.abracadabra-ai.workers.dev/spaces`. The client deploy still stops on custom-domain error 10082 after the script uploads.

## 2026-10-06

- **What changed** — A client page lists people, notes, calls, open tasks, and a timeline. A finished file or a finished request on a linked space shows on that timeline. Staff can merge two clients.
- **Why** — Step 2 of the agency dashboard. The client record is the place to see what happened.
- **Code touchpoints** — `handoff/src/db/crm.ts`, `handoff/src/lib/store/uploads.ts`, `handoff/src/lib/notifications.ts`, `handoff/src/app/clients/`
- **Data-flow impact** — A completed upload writes `file_uploaded` when the space has a client. The first clean file on an open request writes `request_done`. Merge moves the other client's rows onto the one that stays, then closes the extra record.
- **API / schema impact** — none
- **Verification** — `npm test` (229 passed), `npm run lint`, and `npx tsc --noEmit` in `handoff/`. On `hq.localhost`, staff added a person, a note, a call, and a task, marked the task done, and merged a second client. The extra client left the list. The kept page said "These clients are now one."

## 2026-10-06

- **What changed** — Staff pages answer on `hq`. Client folders stay on the Handoff host. Old `/admin` links go to `/spaces`. Staff can add a client and link an existing space.
- **Why** — First step of the agency dashboard. One Worker, two hosts.
- **Code touchpoints** — `handoff/src/lib/host.ts`, `handoff/src/proxy.ts`, `handoff/src/db/crm.ts`, `handoff/migrations/0005_crm.sql`, `handoff/src/app/clients/`
- **Data-flow impact** — New CRM tables. A space can store `organization_id`. Only staff can read or write client rows.
- **API / schema impact** — Migration `0005_crm.sql`. Env `HANDOFF_HQ_HOST` and `HANDOFF_HQ_ORIGIN`. Custom domain `hq.abra-ca-dabra.app`.
- **Verification** — `npm test`, `npm run lint`, and `npx tsc --noEmit` in `handoff/`. Linking a space refreshes the client page so the linked space shows without a second visit.
