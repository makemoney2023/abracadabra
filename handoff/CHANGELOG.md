# Changelog

## 2026-10-06

- **What changed** — A signed Readiness Check result or booking can open a lead. `POST /api/intake/assessment` and `POST /api/intake/booking` check an HMAC and a 5-minute timestamp, then put the body on queue `lead-intake` and return 202. The `handoff` worker writes the lead. A repeat assessment does nothing, except it can fill a missing email. A repeat booking with the same time does nothing. A later time updates that call.
- **Why** — Step 3 of the agency dashboard. New survey leads should land in the client list without copying old rows.
- **Code touchpoints** — `handoff/src/lib/intake/`, `handoff/src/app/api/intake/`, `handoff/cloudflare-worker.ts`, `handoff/wrangler.jsonc`, `handoff/wrangler.hq.jsonc`, `readiness-check/src/lib/handoff-intake.ts`
- **Data-flow impact** — The consumer matches email, then company domain. A free email host is not stored as the company domain. New companies are kind `lead`. The timeline actor is `system`. Bookings use provider `calcom`. A booked or moved call sets the deal to `call_booked` only from `new` or `contacted`.
- **API / schema impact** — No new migration. Env `INTAKE_SIGNING_SECRET` on both Handoff workers. The check uses `HANDOFF_INTAKE_ORIGIN` and the same secret. If either is unset, the check skips the POST.
- **Verification** — `npm test` (245 passed), `npm run lint`, and `npx tsc --noEmit` in `handoff/`. `npm test` (198 passed) and `npm run lint` in `readiness-check/`.

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
