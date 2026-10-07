# Changelog

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
