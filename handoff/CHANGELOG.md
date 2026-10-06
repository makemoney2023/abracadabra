# Changelog

## 2026-10-06

- **What changed** — Hub docs match the two live workers. The root README and the skill-library README say the Cloudflare agent is step 10 and that worker is not built yet. The gameplan says one codebase, two workers sharing D1 and R2, and the client and project routes include linked repos.
- **Why** — Those pages should match the running workers: R2 bucket `handoff` is in use, staff use `handoff-hq`, and the agent worker is still the plan.
- **Code touchpoints** — `README.md`, `.cursor/skills/README.md`, `docs/agency-dashboard-gameplan.md`
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — docs only. No app code change. No deploy.

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
