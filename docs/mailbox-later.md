# Mailbox later

Spec for the eight mailbox items in [hq-agent-spec.md](hq-agent-spec.md) section 18. Those items are implemented. `contacts.opted_out` is migration `0016_contact_opt_out.sql`. `BOOKING_URL` stays empty until a real Cal.com link is configured. Deployed worker versions are recorded in `handoff/CHANGELOG.md`.

## What is already live

An authenticated sender who is not on file becomes one lead (`organizations.kind = lead`, one contact, one deal with `source = email`). Magic asks what they want to accomplish, the problem, and the outcome, then offers `BOOKING_URL` once that sentence is on the brief. `BOOKING_URL` is empty in production, so the live reply asks which two times work. A sender who fails DKIM or DMARC still gets the fixed refusal. A prospect turn files no tasks. Cal.com still writes the appointment only through `POST /api/intake/booking`.

Deployed worker versions for this behavior are in `handoff/CHANGELOG.md`.

## Shared rules

- Do not quote a price, promise a ship date, name another client, change a stage, send an invoice, or start a build.
- A reply that states a price or promises a date is still sent. `kind` becomes `handoff` and nothing is filed. That path stays.
- Unauthenticated unknown mail, auto-replies, bulk mail, self-mail, and mail over 25 MB stay skipped or refused as they are today.
- Do not insert an `appointments` row from the mailbox. Do not set deal stage `call_booked` until Cal.com posts a live booking.
- Do not wake `lead_created` for an email-only lead, and do not wake it while a schema scan is `queued`.
- `BOOKING_URL` stays empty until a real Cal.com link is configured. Do not invent one.

## 1. Qualify budget and timeline without quoting a price

**Today.** `PROSPECT_INSTRUCTIONS` already says not to quote a price or promise a delivery date. `noteProspectTurn` writes the open deal's `next_step` from a named time (`Call ${due}`), then "Book a working session", then the brief sentence. Deals have `next_step` and `next_step_at`. They have no budget column. Staff set a price later, on an approved request's draft invoice.

**Change.** Extend the prospect instructions so Magic asks, one question at a time, what budget band they have in mind and what window they are aiming for. The reply uses their words. It does not name an amount and does not turn the window into a promised date.

**Store.**

- A timeline they name goes through the existing `due` text onto `deals.next_step` (`Call ${due}` when `dueMillis` can read it, otherwise the words, capped at 200 characters).
- A budget they name is stored as a non-numeric activity note on the lead (`kind = email`, body is their words, not a figure Magic added). No new invoice. No numeric column.

**If they name a dollar amount.** The existing safety check still sends the model sentence and files nothing from that turn, including the budget note. Magic's next question does not repeat the number.

**Tests.** A prospect turn that asks for a band files no price and no invoice. A timeline of "Thursday" still sets `next_step` to `Call Thursday`. A reply containing `$500` still has `file: false` and an empty action list.

**Touch.** `handoff/src/lib/hq-chat-playbook.ts`, `handoff/src/lib/prospect-lead.ts` (`noteProspectTurn`), `handoff/src/app/api/client-messages/route.ts` where the prospect record is written.

## 2. Capture a website when the address is freemail, then run the schema scan

**Today.** `openEmailProspect` treats these hosts as freemail and stores no domain and no website: `gmail.com`, `googlemail.com`, `yahoo.com`, `yahoo.co.uk`, `hotmail.com`, `outlook.com`, `live.com`, `icloud.com`, `me.com`, `aol.com`, `proton.me`, `protonmail.com`, `pm.me`, `msn.com`. A company domain is stored as `https://${domain}` at open time, and no scan starts. `startLeadSchemaScan` queues `readiness_scans` when `leadScanTarget` can read a host and a scan queue is passed. `finishManualLead` wakes `lead_created` when the scan is not queued. The mailbox must not call `finishManualLead`.

**Change.** On a later prospect turn, if the lead's website is still empty, Magic asks for the site. When the message contains a host `leadScanTarget` accepts, set `organizations.website` to that origin and call `startLeadSchemaScan` with HQ's `SCAN_JOBS` queue (`env.SCAN_JOBS` on `handoff-hq`). One scan per lead. A second host in a later mail does not start another scan.

**Do not.** Wake the swarm. Scan a blank website. Treat a company-domain lead as this item; that lead already has a website, and starting its scan is a separate decision.

**Tests.** `ada@gmail.com` opens with `website` null and no `readiness_scans` row. A later message `https://northwind.example` sets the website, inserts one queued scan, and does not call the wake. `not a site` leaves the website empty and writes no scan. A missing queue records the existing "scan queue is not connected" failure and still does not wake.

**Touch.** `handoff/src/lib/prospect-lead.ts` (new capture helper), `handoff/src/lib/lead-schema.ts` (call `startLeadSchemaScan` only), `handoff/src/app/api/client-messages/route.ts`.

## 3. Recognize an existing client who writes from a new address

**Today.** Lookup is exact `contacts.email`. A miss calls `open_prospect`. `openEmailProspect` then attaches any company-domain sender to the non-archived organization with that `domain`, including `kind = client`, and the worker labels that first turn `kind: "lead"` because `open_prospect` returns only `id` and `name`. A freemail address cannot match a domain. A second person at a lead's domain joining that lead stays as it is.

**Change.**

- `open_prospect` returns `kind`.
- If the domain matches exactly one non-archived organization with `kind` of `client` or `past_client`, do not insert a lead and do not insert the contact yet. The reply names that organization and asks them to confirm this new address. On a clear yes in the same thread, insert the contact on that organization and continue with the client mailbox instructions, not the prospect script. A clear no leaves an `agent.note` and does not attach.
- If the domain matches more than one such organization, ask which one. Remember the answer on the thread the same way "Which client is this about?" is remembered.
- A freemail address gets the same question and an `agent.note` with the sender address. It is not matched by guessing.

**Do not.** Auto-merge a new address onto a client. Open a second lead for a domain that already belongs to a client.

**Tests.** `bob@acme.example` against one client `acme.example` creates no contact and no second organization until the next message confirms. After confirm, lookup returns that client and `prospect` is false. `ada@gmail.com` against a client does not attach. Two client orgs on one domain ask which one.

**Touch.** `handoff/src/lib/prospect-lead.ts`, `handoff/src/app/api/client-messages/route.ts`, `handoff/src/agent/worker.ts` (`openProspect` must keep `kind`), `handoff/src/lib/client-channel.ts`.

## 4. Hand the thread to a person when it stalls

**Today.** `THREAD_REPLY_LIMIT` is 10. The tenth reply in an hour is `HANDED_OFF` ("A person on the team will pick this up.") and the model is not called. That counts `agent.reply` activities. It does not notice a prospect conversation that never reaches a brief.

**Change.** Before the model, if this is a prospect thread and three logged prospect replies already exist with the brief still null, send `HANDED_OFF`, set `file: false`, and write one `agent.note` ("Prospect thread stalled before a brief."). If the model returns `kind: "handoff"`, send that model sentence, file nothing, and write the same note once per thread. The hourly cap stays.

**Do not.** File tasks. Send a second handoff sentence in the same turn.

**Tests.** Three prospect replies and a null brief produce the person sentence and no model call. A model `handoff` files nothing. Reply four of a prospect who already has a brief still calls the model.

**Touch.** `handoff/src/lib/client-channel.ts`, the `thread` payload from `handoff/src/app/api/client-messages/route.ts` (add a brief-present flag and the prospect reply count).

## 5. Attach files into the lead's space

**Today.** `email()` already calls `attach` when there is an organization and at least one attachment. `storeEmailAttachments` writes into the oldest active workspace. A lead has no workspace until a deal moves to `won`, and that path also sets `organizations.kind` to `client` and creates a project. With no workspace the files are refused and an `agent.note` says the client has no file space. The reply mentions the space only when `stored.length > 0`. Files stay unread until `files.status` is `clean`.

**Change.** When `attach` finds a lead with no active workspace, create one active `standard` workspace for that organization and a single open "Files" request. `project_id` stays null. `organizations.kind` stays `lead`. The deal stage stays whatever it is. Then the existing store path runs. Use `organization.owner_user_id` for `workspace_operators` when that staff user exists. When it does not, still create the workspace and skip the operator row. The mailbox does not invite the sender and does not send a workspace link.

**Do not.** Call the win path in `handoff/src/db/crm.ts`. Put attachment bytes in the model prompt before the file is `clean`.

**Tests.** A lead attachment creates one workspace and one stored name, and the organization is still `lead`. A second attachment reuses that workspace. A hostile or empty file is still refused. A client who already has a space does not gain a second one from this path.

**Touch.** `handoff/src/lib/email-files.ts`. Quota and retention use the same `LIMITS` defaults as the win path.

## 6. Respect an opt-out

**Today.** `contacts.opted_in` exists, `INTEGER NOT NULL DEFAULT 0`, and no application code reads or writes it. Default `0` means "not opted in." It must not mean "do not answer," or every new contact would go silent.

**Change.** Add `contacts.opted_out INTEGER NOT NULL DEFAULT 0` in a new migration. Phrases `stop`, `unsubscribe`, and `opt out` as the whole intent of the message set `opted_out = 1` on that contact, send one short confirmation that mail from this mailbox will stop, write an `agent.note`, and skip the model. Later mail from that address is logged and not answered. The lead, deal, and files stay.

**Do not.** Delete the lead. Treat `opted_in = 0` as an opt-out. Opt out a different contact at the same company.

**Tests.** "Please stop" sets the flag, sends one confirmation, and does not call the model. The next message stores the inbound row and sends nothing. "Do not stop the work" does not match. A second person at the domain still gets a reply.

**Touch.** `handoff/migrations/` (next number after the latest migration), `handoff/src/db/migration-sql.ts`, `handoff/src/lib/client-channel.ts`, contact lookup in `handoff/src/lib/client-channel-store.ts`.

## 7. Send a readiness-check link

**Today.** A finished scan's public report is `https://check.abra-ca-dabra.app/scan/${publicToken}` (`CHECK_ORIGIN` in `handoff/src/lib/schema-report.ts`). The mailbox never sends that URL. `readiness_scans.public_token` is the token already used on `/scan/${token}`.

**Change.** When the prospect reply is about to go out and this lead has a `readiness_scans` row with a `public_token` and status `complete`, append one sentence with that exact URL. Do not append it for `queued`, `failed`, or a missing token. Do not quote a price next to the link. If the scan is not finished, the reply can say the check is still running, without a URL.

**Tests.** A complete scan appends `https://check.abra-ca-dabra.app/scan/` plus the token. A queued scan does not. A reply that already contains the URL is not given a second copy.

**Touch.** `handoff/src/lib/client-channel.ts` (same place `withBookingOffer` appends the booking line), desk or prospect context loaded in `handoff/src/app/api/client-messages/route.ts`.

## 8. When Cal.com books the slot, confirm that time back in the thread

**Today.** `consumeBooking` upserts `appointments` (`provider = calcom`), writes a `call` activity, and moves a deal from `new` or `contacted` to `call_booked` for a live booking (`booked` or `rescheduled`). Duplicate deliveries return `{ duplicate: true }` from the appointment id plus `starts_at` and status, and from `intake_receipts` (`source = booking`, `external_id`). It does not send mail. `starts_at` is unix milliseconds.

**Change.** After a non-duplicate live booking that resolved an organization, send one mail from `Magic at Abracadabra <magic@abra-ca-dabra.app>` to the booking email. The body confirms the `starts_at` time in UTC, in the form `YYYY-MM-DD HH:mm UTC`. Subject is `Your working session`. Find the latest email `work_requests` thread for that organization and set `In-Reply-To` when that thread id exists, so the note lands in the same thread. Record an `agent.reply` activity whose `data_json` includes `external_id`, so a retry that inserts a new receipt still does not send a second confirmation.

A `cancelled` booking sends nothing in this change. A reschedule sends one new confirmation because `starts_at` changed and the duplicate check does not treat it as the same slot.

**Do not.** Use `HANDOFF_FROM_EMAIL` or the product From name. Create an appointment from the mailbox. Confirm when `consumeBooking` returns `duplicate: true`.

**Tests.** A first `booked` payload sends one message and one reply activity. The same payload again sends nothing. A new `starts_at` with the same external id sends one more message. A booking with no email sends nothing.

**Touch.** `handoff/src/lib/intake/consume.ts`. Send through the HQ `EMAIL` binding with From `magic@abra-ca-dabra.app` (the binding on `handoff-hq` is unrestricted). Keep the send after the transaction commits.

## Implementation order

1. Opt-out flag and the stall handoff. Both stop a reply and are safe to ship before the others.
2. Existing-client recognition. This stops a client domain from being labeled a new lead.
3. Freemail website capture and `startLeadSchemaScan`.
4. Readiness link, which needs the scan row from step 3.
5. Lead file space, then the existing `attach` path works for that lead.
6. Budget and timeline questions. Copy and `next_step` only.
7. Booking confirmation. Depends on the intake path, not on the mailbox offer.

Each step gets a failing test first, then the smallest code that passes, then the changelog entry for that step.

## Verification when a step ships

From `handoff/`:

- `npx vitest run` on the touched test files
- `npx eslint` on the touched TypeScript
- `npx tsc --noEmit -p tsconfig.json` when the change is on a path Next typechecks, including tests
- `npx tsc --noEmit -p tsconfig.agent.json` when `handoff/src/agent/` changes

A migration step also updates `handoff/src/db/migration-sql.ts` in the same change. Deploy of `handoff-hq` is required for intake, scan, opt-out, and file space. Deploy of `handoff-agent` is required when `worker.ts` or the prospect instructions bundled in the agent change.
