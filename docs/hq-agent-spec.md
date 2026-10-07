# HQ agent: spec and implementation plan

Status: specification. Nothing in this document is built yet except where a section says "exists."
This extends [agency-dashboard-gameplan.md](agency-dashboard-gameplan.md) sections 7, 9, 10, and 12.
Where the two disagree, this document wins, and the gameplan gets a pointer.

Sources: [Cloudflare Agents](https://developers.cloudflare.com/agents/),
[MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)
(the product older docs call Agents Gateway),
[Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api), and the code under `handoff/`.

---

## 1. What the agent is for

The HQ agent does client work end to end for every client at once, and tells staff what it is doing.

For each client it:

1. Reads what the client gave us: the uploaded files, the intake survey, the won deal, the website.
2. Writes the brief (PRD) and the design system, and gets them approved.
3. Turns the brief into tasks on the Work board. Each task names the skills it will run.
4. Runs those skills. Writing, research, planning, and CRM work happen inside the Worker.
5. Sends a task to a Cursor cloud agent only when it is in the **build** stage and needs a program the Worker cannot run.
6. Pulls the finished piece into the client's Finished work, publishes it, and emails the client once.
7. Reports progress, questions, and blockers to staff on the dashboard the whole way through.

Rules that do not bend:

- The agent never sends client conversation mail. The "work is ready" notice is product mail sent by the dashboard after a clean pull.
- `can_publish` stays off on the agent's key. Built work publishes through a dashboard path with its own gate, not through an agent tool.
- Raw uploaded files, survey answers, mail bodies, and other repos never enter a Cursor prompt. Only text the agent wrote itself does.
- Source code is not copied into D1. Only manifest-listed media and copy go to R2.
- The agent has no D1 binding and no binding to the client file bucket. Everything it knows about a client arrives through MCP.
- The agent connects to one MCP portal. Extra MCP servers are added on that portal. The agent is not redeployed to gain them.

---

## 2. Pieces

| Piece | Where | Role |
|---|---|---|
| `handoff-agent` | new Cloudflare Worker, Agents SDK | `ClientAgent` Durable Object, one per organization id. Runs the loop. |
| MCP portal | Cloudflare One, live at `https://mcp.abra-ca-dabra.app/mcp` | The only MCP URL the agent opens. Fronts Handoff and every other MCP server we add. |
| `handoff-connectors` | new Cloudflare Worker | Reusable host for products that have an API and no remote MCP URL. One path per connector. Section 2.4. |
| `handoff-hq` | exists, `https://hq.abra-ca-dabra.app` | Staff dashboard, Handoff MCP (first server on the portal), GitHub webhook, D1 and R2 owner. |
| `handoff` | exists, `https://handoff.abra-ca-dabra.app` | Client spaces, Finished work, product mail. Gains the cron that wakes agents. |
| D1 `handoff` | exists | Records. Gains migration `0007_agent.sql`. |
| R2 `handoff-skills` | new | Skill library, read only to the agent, bound as `SKILLS`. |
| Cursor Cloud Agents | external | Build-stage runs against the client's linked repo. |
| GitHub App | exists | Reads manifests from PRs. Cursor's own GitHub connection does the clone and push. |

### 2.1 Worker `handoff-agent`

- Package `agents`. Class `ClientAgent extends Agent<Env, AgentState>`.
- `wrangler.agent.jsonc`: `durable_objects.bindings` `ClientAgent`, `migrations[0].new_sqlite_classes: ["ClientAgent"]`, bindings `AI`, `SKILLS` (R2 `handoff-skills`), `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]`. No D1. No `FILES`. Production `MCP_PORTAL_URL` stays empty until the service token and the `handoff` upstream are linked. The portal hostname is live (section 17).
- Secrets: `AGENT_WAKE_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`. `MCP_PORTAL_URL` is a var, not a secret. No `CURSOR_API_KEY`. No `AGENT_MCP_TOKEN` (that key is stored on the portal, section 2.3).
- Entry exports `ClientAgent` and a `fetch` that:
  - `POST /wake` — verifies `AGENT_WAKE_SECRET` (constant-time compare on an HMAC of the body), parses `{ organizationId, reason, ref? }`, calls `getAgentByName(env.ClientAgent, organizationId)` and forwards. Anything else is 401.
  - Falls through to `routeAgentRequest(request, env)` for SDK routing.
- On first run the instance calls `this.addMcpServer("portal", env.MCP_PORTAL_URL, { transport: { headers } })` with `CF-Access-Client-Id` and `CF-Access-Client-Secret`. That option is `AddMcpServerOptions.transport.headers` in `agents` 0.26.0. The server entry persists in the agent's SQL; later wakes call `getMcpServers()` and skip the add.
- `this.mcp.getAITools()` is the tool list for the wake. It is whatever the portal currently publishes, including servers added after the agent was deployed.
- Agent SQL (scratch pad, not a record): `wakes(id, reason, started_at, finished_at, outcome)`, `runs(task_id, skill_path, step, started_at, finished_at, note)`, `cache(key, value, expires_at)`. Anything a person needs to see is written to D1 through MCP, never only here.

### 2.3 MCP portal

One portal for the agency. Every `ClientAgent` connects to the same URL. Adding a server is a portal change, not an agent deploy.

How a call moves:

1. The agent opens `MCP_PORTAL_URL` with the service token. A person is not in the loop.
2. Cloudflare Access accepts the token. **Require user auth** is off on each linked server (`on_behalf: false`), so the portal uses that server's stored admin credential.
3. The portal returns the tools staff enabled, under the aliases staff set.
4. A tool call is proxied to the upstream server. Optional Gateway routing can log the HTTP call and scan it.

First upstream server, linked at setup:

| Portal server name | Upstream | Credential stored on the portal |
|---|---|---|
| `handoff` | `https://hq.abra-ca-dabra.app/api/mcp` | The deployment knowledge key (`scopes` `read,work`). Issued once in HQ, pasted into the portal, not deployed on `handoff-agent`. |

Handoff tool aliases on the portal are the bare names in section 4 (`client_context`, `save_brief`, `create_task`, and the rest), so prompts do not depend on a prefix.

Adding another server follows section 2.4. Two kinds: a remote MCP URL linked on the portal, or an adapter we host when the product has no remote MCP URL. Either way the portal link is the same shape: tools on, aliases set, credential stored, **Require user auth** off. The next wake sees the new tools. No agent deploy.

The agent calls a non-Handoff tool only when the current skill names it and the portal returned it. A skill that names a tool the portal did not return is skipped for that step, and the agent writes `agent.note` with the missing name. The agent does not browse or enable servers on its own.

Because every client shares one upstream Handoff credential, the Durable Object name is the organization id and the agent runtime sets `organizationId` on every Handoff tool call from that name. A value supplied by the model is replaced before the call leaves the instance. Section 4.1 is the server side of that rule. The same stamp applies to every connector tool (section 2.4).

### 2.4 Reusable MCP connectors

One pattern for every product after Handoff. Search Console is the first adapter. The next product is another row and, when needed, another module. The agent worker does not change.

Two kinds:

| Kind | When | What we link on the portal |
|---|---|---|
| `remote` | The product already serves MCP over HTTPS. | That URL. Auth is `oauth` (admin grant finished in the dashboard), `bearer`, or `unauthenticated`. |
| `adapter` | The product has an API and no remote MCP URL the portal can reach. Local or stdio servers count as this. | `https://connectors.abra-ca-dabra.app/mcp/{id}` on worker `handoff-connectors`. |

Portal link, both kinds:

1. Server name is the connector id (`handoff`, `search-console`).
2. Turn on only the tools a skill is allowed to name. Leave the rest off.
3. Alias tools to bare names that do not collide with Handoff or with another server.
4. **Require user auth** off (`on_behalf: false`). A server that still needs a per-user OAuth grant stays unlinked. Service tokens cannot complete that grant, and the agent has no person in the loop.
5. Store the admin credential on the portal. For an adapter, that credential is headers the portal sends to us: `CF-Access-Client-Id`, `CF-Access-Client-Secret`, and `Authorization: Bearer` of `CONNECTOR_TOKEN`. The vendor key (Google service account, and the next vendor's secret) is a secret on `handoff-connectors` only. It is not on the agent and not in the portal.

`handoff-connectors` is one Worker, many paths. Adding a product is a module in a registry, a secret, a portal link, and a grant row. It is not a new Worker and not an agent deploy.

Each module:

- `id` — path segment and portal server name.
- `tools` — name, description, input schema. Inputs do not include a vendor resource id.
- `handle(tool, args)` — calls the vendor API.

Every tool argument includes `organizationId`. The agent runtime sets it from the Durable Object name and replaces a model-supplied value, the same rule as Handoff. The connector ignores any vendor resource id the model sends (`site_url`, property, account id). It loads the grant and calls the vendor with that resource only.

Grants live in D1, migration `0008_connector_grants.sql` (not part of `0007`):

```sql
CREATE TABLE connector_grants (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  connector_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (organization_id, connector_id)
);
```

`resource` is the vendor's id for that client. For Search Console it is the property (`sc-domain:client.com` or the URL-prefix property). Staff set it on the client page. No grant: the tool returns a JSON-RPC error, the agent writes `agent.note`, and no vendor call is made. One shared vendor account covers many clients. A tool never lists or queries a resource outside that row, so `list_sites` on a shared Google account is not exposed.

The connector Worker may bind D1 to read grants. The agent still has no D1 binding.

First rows:

| Id | Kind | Upstream the portal links | Vendor secret | Grant `resource` | Tools the portal may enable |
|---|---|---|---|---|---|
| `handoff` | remote | `https://hq.abra-ca-dabra.app/api/mcp` | none (portal holds the deployment knowledge key) | organization id, already stamped | section 4 bare names |
| `search-console` | adapter | `https://connectors.abra-ca-dabra.app/mcp/search-console` | `GOOGLE_SEARCH_CONSOLE_SA` on `handoff-connectors` | Search Console property | `search_analytics`, `inspect_url` |

Search Console has no official remote MCP server. Community servers are local processes with a service account, so they are not pasted into the portal. Operator step, once per property: enable the Search Console API and add that service account's `client_email` as a user on the property. Google Analytics does ship a remote MCP server; when we add it, it is a `remote` row with an admin OAuth grant, not an adapter.

A skill names connector tools in its file. The agent calls one only when that name is in the current skill and in the portal's tool list. Missing either, the step is skipped and `agent.note` records the name.

### 2.2 Wake reasons

| Reason | Sender | What the agent does |
|---|---|---|
| `onboard` | cron, first time an org has a linked workspace with clean files or a won deal | Section 5: build the brief. |
| `context_changed` | `handoff` after `readSpaceFiles` finishes a batch, or staff edit the website field | Re-read, new brief version if material changed. |
| `brief_approved` | dashboard after client or staff approval | Section 6: plan tasks from the brief. |
| `work` | cron, every 15 minutes, for orgs with tasks not `done` | Section 7: advance each task one step. |
| `changes_requested` | dashboard after feedback with decision `changes` | Section 10: revision round. |
| `run_check` | cron, hourly | Poll `bc-` runs past deadline. |
| `status` | cron, Monday 08:00 local | Draft the weekly client status update (exists in gameplan). |
| `follow_up`, `invoice_reminder`, `digest` | cron | Gameplan 12, unchanged. |

A wake is idempotent. Two wakes with the same reason in flight on one instance: the second sees the first in `wakes` with no `finished_at` and returns 202 without doing work. Durable Object single-threading makes this safe.

---

## 3. Data model: migration `0007_agent.sql`

```sql
-- Task stages and run tracking
ALTER TABLE tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'describe'
  CHECK (stage IN ('describe', 'engineer', 'build', 'run'));
ALTER TABLE tasks ADD COLUMN deliverable_id TEXT REFERENCES deliverables(id);
ALTER TABLE tasks ADD COLUMN cursor_agent_id TEXT;          -- bc-…
ALTER TABLE tasks ADD COLUMN build_deadline_at INTEGER;
ALTER TABLE tasks ADD COLUMN skills_json TEXT;              -- see 6.2
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN round INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN created_by_kind TEXT NOT NULL DEFAULT 'staff'
  CHECK (created_by_kind IN ('staff', 'agent'));
CREATE INDEX tasks_stage_cursor ON tasks (stage, cursor_agent_id);
CREATE INDEX tasks_org_stage ON tasks (organization_id, stage, status);

-- Brief and design system live as deliverables in the client's space
-- (recreate deliverables with the wider CHECK; D1 has no ALTER CHECK)
--   kind IN ('social_pack','website','document','brief','design_system','other')

-- Organization-level agent settings
ALTER TABLE organizations ADD COLUMN brief_approval TEXT NOT NULL DEFAULT 'client'
  CHECK (brief_approval IN ('client', 'staff'));
ALTER TABLE organizations ADD COLUMN auto_publish_built INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN agent_paused_at INTEGER;

-- Deployment key for the portal. scopes and can_publish already exist (0005).
-- organization_id stays null on that key; the call carries the org (section 4.1).
ALTER TABLE knowledge_keys ADD COLUMN organization_id TEXT REFERENCES organizations(id);

-- Questions the agent asks staff, and their answers
CREATE TABLE agent_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT REFERENCES tasks(id),
  deliverable_id TEXT REFERENCES deliverables(id),
  question TEXT NOT NULL,
  options_json TEXT,                 -- optional list of choices
  answer TEXT,
  answered_by TEXT REFERENCES staff(user_id),
  asked_at INTEGER NOT NULL,
  answered_at INTEGER
);
CREATE INDEX agent_questions_open ON agent_questions (organization_id, answered_at);

-- Cloud runs, one row per POST /v1/agents, so a task can have several rounds
CREATE TABLE cloud_runs (
  id TEXT PRIMARY KEY,               -- bc-… from Cursor
  task_id TEXT NOT NULL REFERENCES tasks(id),
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  repo_id TEXT NOT NULL REFERENCES repos(id),
  round INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'pr_open', 'pulled', 'failed', 'expired')),
  branch TEXT,
  pr_number INTEGER,
  head_sha TEXT,
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT
);
CREATE INDEX cloud_runs_open ON cloud_runs (status, deadline_at);

-- Global cap on simultaneous cloud runs
CREATE TABLE agent_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO agent_settings (key, value) VALUES ('max_cloud_runs', '4');

-- Email receipts so a retried webhook never mails twice
CREATE TABLE deliverable_notices (
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  version INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (deliverable_id, version)
);
```

Notes:

- `tasks.cursor_agent_id` mirrors the latest `cloud_runs.id` so the board query stays one table. `cloud_runs` is the history.
- `deliverables` with the wider `kind` CHECK: D1 cannot alter a CHECK, so `0007` recreates the table with the same columns plus the two kinds, copies rows, swaps names, and recreates the indexes from `0005` and `0006`. Test this migration against a fixture database with existing deliverables.
- `activities.kind` gains agent kinds (no schema change, `kind` is free text): `agent.brief_drafted`, `agent.design_system_drafted`, `agent.plan_written`, `agent.task_created`, `agent.skill_started`, `agent.skill_done`, `agent.repo_created`, `agent.build_started`, `agent.build_pulled`, `agent.build_failed`, `agent.blocked`, `agent.question`, `agent.answered`, `agent.revision_started`, `agent.published`. `data_json` carries `{ taskId, deliverableId, skillPath, runId, repo }` as applicable.

---

## 4. MCP: auth and tools

`/api/mcp` on `handoff-hq` exists with tools `search_files` and `list_files`, authenticated by a per-workspace knowledge key. This section widens it. It is one upstream server behind the portal in section 2.3. The MCP layer stays a thin adapter; every write still goes through functions in `handoff/src/db/crm.ts` and `handoff/src/db/deliverables.ts` with a `Caller` of kind `agent`.

### 4.1 Auth

- Workspace keys are unchanged: `principalForKnowledgeKey(sql, token)` returns `{ kind: 'workspace', workspaceId }` and those callers cannot pass `organizationId`.
- The agent uses one deployment key: `organization_id` null, `scopes` `read,work`, `can_publish` 0. The portal stores this key and attaches it when it proxies to Handoff. The agent Worker does not hold it.
- Every Handoff tool takes `organizationId`. The server accepts it only for the deployment key, and only when that id is a live organization. The agent runtime overwrites it with the Durable Object name before the call is sent, so the model cannot aim a write at another client.
- For an agent principal, `list_files` and `search_files` take an optional `workspaceId` that must belong to that organization; with none given they search every workspace of the organization.
- Tools marked `work` below reject a principal without `work` in scopes with JSON-RPC error `-32001 forbidden`.
- Every `work` tool takes `requestId`. The server keys `idempotency_keys(key = requestId, actor_id = key id, tool)` and returns the stored `result_json` on a repeat.

### 4.2 Read tools

**`client_context`** → one object the agent needs on every wake.

```json
{
  "organization": { "id", "name", "website", "industry", "notes", "briefApproval", "autoPublishBuilt", "agentPausedAt" },
  "deal": { "id", "title", "stage", "wonAt" } | null,
  "assessment": { "totalScore", "scores": {...}, "answerSummary": "agent-safe text, never raw answers" } | null,
  "project": { "id", "name", "status", "dueAt", "milestones": [...] } | null,
  "workspaces": [ { "id", "slug", "displayName", "logoObjectKey", "policyProfile", "fileCounts": { "clean", "waiting", "failed" } } ],
  "repos": [ { "id", "fullName", "projectId", "defaultBranch" } ],
  "briefs": [ { "deliverableId", "kind": "brief|design_system", "status", "version", "publishedVersion" } ],
  "tasks": [ { "id", "title", "status", "stage", "round", "deliverableId", "cursorAgentId", "skills": [...], "blockedReason" } ],
  "openQuestions": [ { "id", "question", "askedAt" } ],
  "answeredSince": [ { "id", "question", "answer", "answeredAt" } ]
}
```

`answerSummary` is built on the server by the existing readiness scoring text, not by passing `answers_json` through. This is the only place survey data touches the agent, and it is already summarized.

**`get_brief`** `{ kind }` → current body of the brief or design system, plus the latest `changes` feedback comments if any.

**`list_files`**, **`search_files`** — exist. Add `tag` filter (`brand`, `copy`, …) and return `file_reads.summary`, `status`, `relative_path`, `tag`.

**`list_feedback`** `{ deliverableId }` → feedback rows with item ids, decision, body.

### 4.3 Work tools

| Tool | Args | Backing function | Notes |
|---|---|---|---|
| `save_brief` | `kind, title, bodyMarkdown, sourcesJson, requestId` | `createDeliverable` / new version on existing | kind `brief` or `design_system`; always `draft`; one item `brief.md`; `sourcesJson` lists file ids and summaries used. Writes `agent.brief_drafted`. |
| `create_task` | `title, projectId?, milestoneId?, stage, skills, deliverableKind?, dueAt?, requestId` | `createTask` (agent path) | `created_by_kind='agent'`, `assignee_user_id` null, status `todo`. Writes `agent.task_created`. |
| `update_task` | `taskId, status?, stage?, skills?, blockedReason?, note?, requestId` | `updateTask` (agent path) | Stage `build` runs the gate in 7.3 on the server and starts the cloud run there. The agent does not hold `CURSOR_API_KEY`; see the note below. |
| `create_deliverable` | `title, kind, projectId, workspaceId, requestId` | `createDeliverable` | Draft only. |
| `add_deliverable_item` | `deliverableId, path, bodyMarkdown \| objectKey, requestId` | new | For skill output that is a document or copy. |
| `post_status_update` | `projectId, health, audience, body, requestId` | `postStatusUpdate` | `audience: internal` is the agent's progress report to staff. `client` stays draft. |
| `add_note` | `body, taskId?, deliverableId?, requestId` | `addNote` | Activity `kind='agent.note'`. |
| `ask_staff` | `question, options?, taskId?, deliverableId?, requestId` | new | Inserts `agent_questions`, activity `agent.question`, and if the task would otherwise stall, sets it `blocked` with `blocked_reason='waiting_on_staff'`. |
| `list_repos` | — | `listRepos` | |

`organizationId` is not an argument the model fills in. The agent runtime adds it from the Durable Object name on every Handoff call.

**Where `CURSOR_API_KEY` lives.** Two options were weighed:

- (a) The agent holds the key and calls Cursor from the Worker.
- (b) The dashboard holds the key and `update_task` to `build` triggers the call.

**Decision: (b).** The dashboard already owns the gate inputs (approved briefs, linked repo, global cap, `cloud_runs`). Putting the call there means one place enforces the rule "only build stage, only one run per round, only under the cap," and a bug in the agent loop cannot start a run. The agent's job is to write the engineered brief and ask for the stage change. `handoff-agent` does not hold `CURSOR_API_KEY`. Its secrets are `AGENT_WAKE_SECRET`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET`.

---

## 5. Understanding the client: describe and engineer

Nothing is planned for a client until a brief and a design system exist and are approved.

### 5.1 Brief (PRD), stage `describe`

Trigger: `onboard` or `context_changed`.

1. `client_context`. If `agentPausedAt` is set, stop and record the wake as `paused`.
2. `list_files` for every workspace. Read every summary with status `ready`. Note `waiting` and `failed` files by path.
3. `search_files` with a fixed set of questions, each run per workspace: what the client sells; who buys; what the client already has (site, brand, content); what they asked for; deadlines or launch dates; constraints (tone, legal, platforms).
4. Load the skill `brief-writing` (or the nearest match from the index) and follow it.
5. Write `brief.md`:
   - Client and goal (one paragraph).
   - Audience.
   - Current state (what exists today, from files and website).
   - Scope: the pieces of work, each with a kind (`website`, `social_pack`, `document`, `other`) and a one-line outcome.
   - Supplied material (file paths used, with the tag).
   - Gaps (files that failed or are missing, questions).
   - Acceptance checks per piece.
   - Sources (file ids, assessment summary, website URL).
6. `save_brief kind=brief`. Activity `agent.brief_drafted` with the version.
7. For each gap that blocks scope, `ask_staff` with the question. Otherwise `post_status_update audience=internal` saying the brief is drafted and waiting for approval.

The brief is a deliverable of kind `brief` in the client's space. Staff see it under the project and in Finished work drafts. Approval:

- `brief_approval='client'` (default): staff publish it; the client approves or asks for changes in Finished work. Approval fires `brief_approved`.
- `brief_approval='staff'`: a staff "Approve brief" action sets the deliverable `approved` without publishing, and fires `brief_approved`.

`changes` on the brief fires `context_changed`; the agent reads the comments through `list_feedback` and writes the next version.

### 5.2 Design system, stage `engineer`

Trigger: `brief_approved` for kind `brief`, or `context_changed` once a brief exists.

1. `list_files tag=brand`, and `search_files` for colors, fonts, logo usage, voice.
2. Website: `client_context.organization.website`. The agent fetches the home page once (public hosts only, under `global_fetch_strictly_public`), strips it to text plus the color and font tokens found in `<link>`/`<style>`, and caches the result in agent SQL for 24 hours. If the fetch fails the design system says so and works from files alone.
3. Load the skill `design-system` (or nearest) and follow it.
4. Write `design-system.md`: palette with hex and usage; type (families, scale); spacing and radius; logo rules (from `logoObjectKey` and brand files); voice and tone with three example lines; component list the brief's pieces need; accessibility notes. If the client supplied no brand material, say so and propose one marked "proposed."
5. `save_brief kind=design_system`. Same approval path as the brief.

Both documents gate `build` (7.3). They do not gate `describe` or `engineer` tasks, so research and writing can start as soon as the brief is approved.

---

## 6. From brief to tasks and skills

### 6.1 Planning

Trigger: `brief_approved` for kind `brief`.

1. `client_context`, `get_brief kind=brief`.
2. For each piece in the brief's scope, decide the skills. Load `skills/index.json` from `SKILLS` (names and descriptions only), score each skill's description against the piece, and keep the ordered set that covers it. Typical:
   - Website piece: `research/competitor-teardown` → `copywriting/landing-page` → `design/website-build` (build) → `qa/site-review` (run).
   - Social pack: `marketing/content-planner` → `copywriting/social` → `ai-image-generation` (build, if images are to be made) → review.
   - Document: `research/*` → `copywriting/*` → done in Worker.
3. `create_task` per piece with `stage=describe` or `engineer` (engineer when research is done in the brief already), `skills` set, `deliverableKind`. One `create_deliverable` draft per piece so items can accumulate before build.
4. `post_status_update audience=internal`: "Planned N tasks for <client>: …" with the task titles. Activity `agent.plan_written`.

### 6.2 `skills_json`

```json
{
  "steps": [
    { "path": "research/competitor-teardown/SKILL.md", "mode": "complete", "status": "done", "startedAt": 0, "finishedAt": 0, "note": "…" },
    { "path": "copywriting/landing-page/SKILL.md", "mode": "complete", "status": "doing" },
    { "path": "design/website-build/SKILL.md", "mode": "plan", "status": "todo" },
    { "path": "qa/site-review/SKILL.md", "mode": "complete", "status": "todo", "stage": "run" }
  ],
  "current": 1
}
```

`mode` is the gameplan's rule: `complete` when every step fits Workers AI plus MCP; `plan` when a step needs a program the isolate does not run. A `plan` step is what moves the task to `build`.

### 6.3 Running a step (`work` wake)

For each task of this client that is not `done` and not `blocked` on staff:

1. Load the current step's `SKILL.md` from `SKILLS`. Only that file.
2. Follow it with Workers AI and the MCP tools. Output goes to `add_deliverable_item`, `add_note`, or `post_status_update`.
3. `update_task` with the new `skills_json` (step done, `current` advanced) and `note`. Activity `agent.skill_done`.
4. When the next step is `mode=plan`: write the engineered build brief as a deliverable item `build-brief.md` (section 7.2), then `update_task stage=build`.
5. When all steps are done and no `plan` step existed: `update_task status=done stage=run`. The deliverable stays `draft` and keeps the Publish button for staff. Finished-in-Worker work is not auto-published.
6. A wake does at most one step per task and at most eight steps total, then reschedules itself with `this.schedule(60, 'work')` if work remains. This keeps a wake under the Worker CPU budget and spreads load across clients.

A step that cannot proceed because something is unknown calls `ask_staff`. The task goes `blocked` with `blocked_reason='waiting_on_staff'`. The next wake after `answeredSince` includes that question resumes it.

---

## 7. Build stage: Cursor cloud agent

### 7.1 Rule

A cloud run starts only when a task's stage becomes `build`, only through `update_task`, only on the dashboard. `describe`, `engineer`, and `run` never call Cursor. Staff tasks never call Cursor unless staff move them to `build` with a deliverable and a build brief attached.

### 7.2 Engineered build brief

Written by the agent as a deliverable item before the stage change. It is the whole prompt. Contents:

- Deliverable id, kind, title.
- The relevant part of the approved brief (goal, audience, acceptance checks for this piece).
- The design system, in full.
- Items already in the deliverable (copy, shot lists, prompts) by path.
- Output contract: branch `handoff/<deliverable_id>/r<round>`, file `deliverables/<slug>/manifest.json` per `parseManifest`, only listed media and copy in the PR, PR title `Deliverable <id> round <round>`, PR body first line `Deliverable: <id>`.
- What not to do: no secrets, no changes outside `deliverables/<slug>/` and the app paths the brief names, no force push.

Nothing else. The dashboard rejects the stage change if the build brief item is missing.

### 7.3 Gate (server side, in `updateTask` when `stage` becomes `build`)

All must hold, else the task is set `blocked` with the reason and no call is made:

1. Organization has a `brief` and a `design_system` deliverable in status `approved`. Reason: `brief_not_approved` / `design_system_not_approved`.
2. Task has `deliverable_id` and that deliverable has a `build-brief.md` item. Reason: `missing_build_brief`.
3. A repo to build in. Use the repo linked to the task's project. If the task has no project repo and the organization has exactly one linked repo, use that one. If the organization has no linked repo, create one (section 7.3.1) and use it. If it has several and none is on this project, stop with `link_a_repo`. A create that fails stops with `repo_create_failed` or `repo_name_taken`. No Cursor call until a repo row exists.
4. No `cloud_runs` row for this task and round in status `started` or `pr_open`. If one exists, resume it: no new call.
5. `COUNT(cloud_runs WHERE status IN ('started','pr_open')) < agent_settings.max_cloud_runs`. Reason: `cap_reached`; the task stays `todo` in `build`, not blocked, and is retried on the next `work` wake.
6. `organizations.agent_paused_at` is null. Reason: `agent_paused`.

### 7.3.1 Create a repo when the client has none

This runs inside the same gate, on the dashboard, before the Cursor call. The GitHub App key stays on `handoff-hq`. The agent does not hold it. `update_task` to `build` is what starts the create.

1. Name the repo from the organization name: lowercase, spaces and punctuation become single hyphens, nothing but letters, numbers, and hyphens, at most 100 characters. A name that would be empty uses the organization id.
2. Use the one live GitHub App installation. More than one live installation stops with `repo_create_failed` and an `ask_staff` row, because the gate will not guess an account.
3. `POST /orgs/{login}/repos` when that install is an Organization, or `POST /user/repos` when it is a User. Body: `name`, `private: true`, `auto_init: true` so `main` exists. The installation token is the one the app already mints. The app permission required is Administration write. Metadata read is not enough.
4. Link the new repo to this organization and to the task's project, `owned_by='agency'`, `is_private=1`. Activity `agent.repo_created` with the full name.
5. A repeat of the same stage change finds the linked row and does not create a second repo.
6. GitHub says the name exists. If that repo is already linked to this organization, use it. If it is linked to another organization, or it is not in `repos` at all, stop with `repo_name_taken`. Do not attach a repo this gate did not create.
7. GitHub is down, the install is suspended, or the token is refused: `repo_create_failed`, task `blocked`, `ask_staff`, no Cursor call.

Cursor's own GitHub connection has to be able to see the new repo. An install limited to a hand-picked repo list will not see a repo created after that list was saved. The agency install used by Cursor is all repositories.

### 7.4 The call

`POST https://api.cursor.com/v1/agents` with basic auth on `CURSOR_API_KEY`. **The body shape must be confirmed against the current API reference before code is written (`confirm-api`).** Fields the plan relies on, to be verified: repository URL and ref, the prompt text, `target.autoCreatePR: true`, `target.branchName`, `skipReviewerRequest: true`. The response id (`bc-…`) is stored in `cloud_runs.id` and `tasks.cursor_agent_id`; `deadline_at = now + 2h` (setting `build_deadline_hours`, default 2); task status `doing`; activity `agent.build_started` with `{ runId, repo, branch }`.

Failure to start (4xx/5xx): `cloud_runs` row with status `failed` and `error`, task `blocked` reason `cursor_start_failed`, activity `agent.build_failed`, and an `ask_staff` row so it shows in the staff queue.

### 7.5 Completion: GitHub webhook

`onPullRequest` in `handoff/src/lib/github/consume.ts` gains a branch for linked repos:

1. Parse `Deliverable: <id>` from the PR body, fall back to the branch pattern `handoff/<id>/r<n>`.
2. Load `cloud_runs` by task + round (or by `deliverable_id` + branch). Check `repos.organization_id = deliverables.organization_id`. Mismatch: activity `agent.build_failed` reason `repo_org_mismatch`, stop.
3. On `opened` and `synchronize`: set `cloud_runs.status='pr_open'`, `pr_number`, `branch`, `head_sha`. Resolve the head sha with `resolveCommitSha`, pull with `loadManifestBundle` and `pullDeliverableFromManifest` at that sha. `synchronize` produces the next version of the same draft.
4. On a clean pull: `cloud_runs.status='pulled'`, `finished_at`; task `done`, stage `run`, `done_at`; activity `agent.build_pulled`.
5. On a manifest reject: `cloud_runs.status='failed'`, task `blocked` reason `manifest_rejected` with the parse message; activity `agent.build_failed`. No publish, no mail.
6. `closed` with `merged`: no action needed for the deliverable (already pulled). Unmerged close: `cloud_runs.status='failed'`, task `blocked` reason `pr_closed`.

### 7.6 Expiry

`run_check` wake (hourly) and the `work` wake both call `client_context`; the dashboard side runs `expireCloudRuns(now)` on its cron: every `cloud_runs` in `started` past `deadline_at` is checked with `GET /v1/agents/{id}`. `FINISHED` with no PR seen → wait one more cycle, then `expired`. `FAILED`/`CANCELLED` → `failed`. Either way the task goes `blocked` with the reason and staff get an `agent_questions` row: "Run for <task> did not produce a PR. Retry, or take over?"

---

## 8. Publish and notify

On a clean pull from the task path (7.5 step 4), inside the same consumer transaction:

1. If `organizations.auto_publish_built = 1`: `publishDeliverable` so `published_version` is set. Else leave draft; staff get a `post_status_update`-style activity `agent.ready_to_publish` and the Publish button.
2. If published: insert `deliverable_notices (deliverable_id, version)`. If the row already exists, stop (retried webhook).
3. Enqueue the product event `deliverable_published` for every membership on the deliverable's workspace through the existing notifications path (`queueProductEvent` → `notifications` table → `sendHandoffMail`). Idempotency key `deliverable:<id>:v<version>:<email>`. Subject: "<Workspace display name>: <deliverable title> is ready". Body: one paragraph and the link `https://handoff.abra-ca-dabra.app/w/<slug>/work/<deliverable id>`. Sender name from `workspaces.sender_name`.
4. Activity `agent.published` with `{ deliverableId, version, recipients: n }`.

Blocked tasks send no mail. Staff-built deliverables are untouched.

---

## 9. Talking to staff

Staff must be able to answer "what is the agent doing, for whom, and does it need me" without reading logs. Three channels, all already-shaped records:

### 9.1 Activity stream (`activities`, `actor_kind='agent'`)

Every agent action writes one activity with an `agent.*` kind (section 3) and `data_json` pointing at the task, deliverable, skill, or run. This is the audit trail and the dashboard feed. The agent writes it through `add_note` or as a side effect of each work tool; the agent never has to remember to log.

### 9.2 Progress reports (`status_updates`, `audience='internal'`, `actor_kind='agent'`)

- After planning: what was planned.
- After each task reaches `build`: "Sent <task> to build; expect a PR in ~N minutes."
- After each pull: "<task> is in Finished work (vN)." or "Published and emailed <n> people."
- On every `work` wake that did something: a short rollup per project if more than three activities happened since the last report. Rollups avoid one update per step.
- Weekly on `status`: the client-facing draft (exists) plus an internal line on what the agent finished and what is blocked.

Internal updates are `published` immediately (they are staff-only). Client updates stay `draft`.

### 9.3 Questions and blockers (`agent_questions`)

`ask_staff` is how the agent stops and waits. A question has an optional set of options so staff can answer with one click. Answering writes `answer`, `answered_by`, `answered_at`, activity `agent.answered`, and wakes the agent with reason `work`. If the question was attached to a blocked task, the answer clears `blocked_reason` and sets the task back to `todo`.

Staff can also talk first: a note on a task or deliverable with `actor_kind='staff'` and `kind='staff.instruction'` is surfaced in `client_context.tasks[].staffNotes` on the next wake, and the agent treats it as an instruction for that task.

---

## 10. Revision loop

Client feedback with decision `changes` (exists: `recordFeedback` → `statusFromItems` → `changes_requested`):

1. Dashboard finds the task by `deliverable_id` with the highest `round`, creates the next round: same title, `round + 1`, stage `engineer`, status `todo`, `skills_json` reset to the steps from the copywriting step onward (the research steps are kept as done), `deliverable_id` unchanged. Activity `agent.revision_started`.
2. Wake `changes_requested`. The agent calls `list_feedback`, reads the item-level comments, revises the deliverable items and the build brief (new `build-brief.md` version that quotes the feedback and says what changes), and moves the task to `build` again.
3. 7.3 to 8 run again. The pull lands as the next version. `deliverable_notices` is keyed on version, so the client is emailed once per revision.

Approval (`approve` on every item → `approved`) ends the loop. If a `run`-stage review skill exists on the task it runs now and posts the final internal update.

---

## 11. Many clients

- Cron on `handoff` (`triggers.crons: ["*/15 * * * *", "0 * * * *", "0 8 * * 1"]`, mapped by `event.cron`) runs `wakeDueAgents(env)`: selects organizations with `archived_at IS NULL AND agent_paused_at IS NULL` and either open tasks, unanswered `context_changed` flags, or a due weekly status, and POSTs `/wake` to `handoff-agent` per organization with `AGENT_WAKE_SECRET`. One HTTP call per client; failures are logged as `activities actor_kind='system' kind='agent.wake_failed'` and retried next cycle.
- One Durable Object per organization. Client A's wake cannot slow client B's.
- The global cap is enforced in `updateTask` (7.3 step 5) because it needs the cross-client count. Per-client instances do not see each other.
- `expireCloudRuns` and `wakeDueAgents` run in the same `scheduled` handler, dashboard side.

---

## 12. Dashboard changes

### 12.1 Today (`/`, `today-screen.tsx`)

`todayFor` already returns `agentNotes` (agent activities from the last week). Replace that card with an **Agent** section:

- **Needs you**: open `agent_questions` across all clients, newest first, each with the client, the question, option buttons if any, a free-text answer, and the task link. Count badge in the sidebar.
- **Blocked by the agent**: tasks `blocked` with a `blocked_reason` set by the agent, grouped by reason (`link_a_repo`, `repo_create_failed`, `repo_name_taken`, `brief_not_approved`, `cursor_start_failed`, …) with the one action that clears each.
- **In build**: `cloud_runs` in `started`/`pr_open` with client, task, elapsed time, deadline, PR link when open. Shows `n / max_cloud_runs`.
- **Recent agent activity**: the last 30 `agent.*` activities across clients, each line: time, client, verb, object link. Filter chips by kind family (brief, plan, skill, build, publish, question). "See all" goes to 12.2.
- **Briefs waiting**: `brief`/`design_system` deliverables in `draft` or `in_review`, with Approve (when `brief_approval='staff'`) or Publish for client review.

`todayFor` adds `agentQuestions`, `agentBlocked`, `cloudRuns`, `agentActivity`, `briefsWaiting`. Each is one query; keep the `Promise.all`.

### 12.2 Agent page (`/agent`, new, sidebar item "Agent")

- Global controls: `max_cloud_runs`, pause all (sets `agent_paused_at` on every org; separate from per-org pause), the time of the last cron wake and how many agents it woke.
- Full activity feed with filters: client, kind, date range; paged 50.
- Runs table: every `cloud_runs` row, status, duration, PR, outcome.
- Questions archive: answered questions with who answered.

Sidebar `staff-nav.tsx` gains "Agent" between Work and Spaces; `staff-nav-match.ts` learns `/agent`.

### 12.3 Clients (`/clients/[id]`)

- **Agent** card: pause/resume this client, `brief_approval` toggle, `auto_publish_built` toggle, brief and design-system status with links, open questions for this client.
- The existing timeline (`listTimeline`) already shows `actor_kind`. Render agent rows with a bot mark and the `data_json` link.

### 12.4 Work board (`/work`)

- Stage filter chips: Describe, Engineer, Build, Run. Column or badge on each card showing stage and round.
- Cards created by the agent show a bot mark. Cards in build show elapsed time and the PR link.
- A card's drawer shows `skills_json` as a checklist (done, doing, todo) and the latest `agent.*` activities for that task.
- Blocked cards show `blocked_reason` and the clearing action (pick a repo, retry creating a repo, choose another repo name, approve brief, answer question, retry run).

### 12.5 Project page (`/projects/[id]`)

- Status updates list already exists; internal agent updates render there with the bot mark.
- Deliverables list shows `brief` and `design_system` first with approval state.

### 12.6 Finished work, client side (`/w/[slug]/work`)

- `brief` and `design_system` render as documents with the existing feedback UI. Copy for the client: "Review the brief" rather than "Finished work" in the card label for those two kinds.
- No other change; built work arrives as today once `published_version` is set.

All new UI uses the existing shadcn components in `handoff/src/components/ui`.

---

## 13. Skills library publish

- `scripts/publish-skills.ts` (in `handoff/`): walks `.cursor/skills/**/SKILL.md`, parses front matter (`name`, `description`), writes `skills/index.json` and each body to R2 `handoff-skills` via `wrangler r2 object put` or the S3 API. Pack = first path segment. `skills/org` is excluded. Run manually; not on deploy.
- Two skills this spec names that may not exist yet in the library: `brief-writing` and `design-system`. If the index has no match above a threshold, the agent uses a built-in fallback prompt for those two steps and writes `agent.note` saying which skill it fell back on, so the gap is visible.

---

## 14. Security and limits

- `/wake` verifies an HMAC-SHA256 of the raw body with `AGENT_WAKE_SECRET` in header `x-handoff-signature`, constant-time compare, 5-minute timestamp window in the body.
- The portal accepts the agent only with the Access service token. The Handoff upstream credential is a `knowledge_keys` row with `organization_id` null and `scopes='read,work'`. Rotating it is `issueKnowledgeKey`, `revoked_at` on the old row, and a paste of the new secret into the portal's stored credential for `handoff`.
- `organizationId` on a Handoff tool is accepted only for that deployment key. The agent runtime sets it from the Durable Object name and drops any other value. A workspace key that sends `organizationId` is rejected.
- `client_context` never returns `answers_json`, mail bodies, or file contents. `search_files` returns passages from the client's own files only.
- Cursor prompt = `build-brief.md` only. A test asserts the prompt builder rejects any input containing the markers `answers_json`, `From:`, or a file body larger than the brief itself.
- Worker budget: each wake does at most eight skill steps; long work reschedules itself. Workers AI calls are bounded by the step; a step that exceeds the token budget writes `agent.note` and asks staff.
- The cap on cloud runs (default 4) protects the Cursor spend. `max_cloud_runs=0` is a kill switch for builds without pausing writing work.

---

## 15. Config

| Name | Where | Purpose |
|---|---|---|
| `AGENT_WAKE_SECRET` | `handoff` (sender), `handoff-agent` (verifier) | Signs wake calls. |
| `MCP_PORTAL_URL` | `handoff-agent` (var) | The agency portal URL. Same value for every client. |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | `handoff-agent` | Access service token. Sent as `CF-Access-Client-Id` and `CF-Access-Client-Secret`. |
| `AGENT_MCP_TOKEN` | MCP portal, upstream credential for `handoff` | The deployment knowledge key with `read,work`. Issued in HQ. Not a Worker secret. |
| `CONNECTOR_TOKEN` | MCP portal headers for each adapter, and `handoff-connectors` | Bearer the portal sends to `handoff-connectors`. Not on `handoff-agent`. |
| `GOOGLE_SEARCH_CONSOLE_SA` | `handoff-connectors` | Google service-account JSON for the Search Console adapter. Not on the portal and not on the agent. |
| `CURSOR_API_KEY` | `handoff-hq` | Starts and polls cloud runs. |
| `AGENT_URL` | `handoff` | `https://agent.abra-ca-dabra.app` (or workers.dev) for wakes. |
| `max_cloud_runs`, `build_deadline_hours` | `agent_settings` | Editable on `/agent`. |

Add `AGENT_WAKE_SECRET`, `CURSOR_API_KEY`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` to `handoff/.env.example` with comments. `AGENT_MCP_TOKEN` is commented as a portal credential, not a Worker secret. Document the portal and the Worker in `handoff/README.md` under a new "Agent" section.

---

## 16. Build order and tests

Each step: write the failing test, implement, wire, run `vitest run` and `eslint` in `handoff/`, update README and CHANGELOG. No step ships half-wired.

1. **Migration `0007_agent.sql`** — test: migrates a fixture with existing deliverables and tasks; new columns default correctly; `deliverables` CHECK accepts `brief`.
2. **MCP auth and read tools** — `principalForKnowledgeKey`, `client_context`, `get_brief`, `list_feedback`, `tag` filter. Tests: workspace key unchanged; agent key sees all org workspaces; `answers_json` never in output; forbidden on `work` tools without scope.
3. **MCP work tools** — `save_brief`, `create_task`, `update_task` (without the build gate), `create_deliverable`, `add_deliverable_item`, `post_status_update`, `add_note`, `ask_staff`, `list_repos`. Tests: `actor_kind='agent'` activities; idempotency returns stored result; cross-org write impossible.
4. **Cron and wake** — `scheduled` on `handoff`, `wakeDueAgents`, signed POST. Tests: HMAC verify, replay window, orgs selected correctly, failure activity.
5. **`handoff-agent` skeleton** — done. `ClientAgent`, `/wake`, connect to `MCP_PORTAL_URL` with `transport.headers`, `wakes` dedupe, `SKILLS` index load. Tests: wake dedupe returns 202, 401 on a bad signature, index parse, `organizationId` on outbound Handoff calls equals the Durable Object name. Tool names come from the portal's tool list (`toolNamesFrom`), including a tool this worker does not catalog. The Workers test pool cannot intercept fetch inside the Durable Object, so the live portal handshake is not part of that test.
6. **Describe and engineer** — brief and design-system flows. Tests: given fixture `client_context` and file summaries, the agent calls `save_brief` twice with the sections present; gaps become `ask_staff`.
7. **Planning and skill steps** — `skills_json` state machine, one-step-per-wake, reschedule. Tests: step advance, `plan` step moves to build, done path leaves draft unpublished.
8. **Build gate, repo create, and Cursor start** — after `confirm-api`. Tests: each gate reason; a client with no repo gets one private repo created and linked, then the Cursor call uses that full name; a second pass does not create another; a name owned by someone else blocks with `repo_name_taken`; several existing repos and none on the project still `link_a_repo`; cap; resume without a second call; mocked GitHub `POST /orgs/{login}/repos` and `POST /v1/agents`.
9. **Webhook pull** — `onPullRequest` branch, `cloud_runs` transitions, `synchronize` versions. Tests with recorded payloads.
10. **Publish, notice, receipt** — Tests: one mail per version; `auto_publish_built=0` leaves the Publish button; blocked sends nothing.
11. **Revision loop** — Tests: `changes` creates round 2 at engineer; second pull emails once.
12. **Expiry** — `expireCloudRuns` with mocked `GET /v1/agents/{id}`.
13. **Dashboard** — Today Agent section, `/agent`, client Agent card, board stage filter and drawer, project and client-side rendering of the two document kinds. Behavior tests on `todayFor` and the work query; component tests for the question answer form.
14. **Skills publish script** and the two new skills if missing.
15. **Docs** — README (Agent section, stages, tools, cron), CHANGELOG entries per step, gameplan section 12 pointer and the two amended rules (skills chosen by the brief; `CURSOR_API_KEY` on the dashboard).
16. **Reusable MCP connectors** — does not block steps 6–14. A skill that names a connector tool before that server is linked already ends in `agent.note`. Worker `handoff-connectors`, migration `0008_connector_grants.sql`, registry module, Search Console adapter (`search_analytics`, `inspect_url`). Tests: missing bearer is 401; a model-supplied `site_url` is ignored and the call uses `connector_grants.resource`; no grant makes no vendor call; a second module registers without an agent change. Staff set the grant on the client page. Portal link for `search-console` uses the Access service-token headers plus `CONNECTOR_TOKEN`, **Require user auth** off. `remote` products (official Google Analytics MCP, when added) are a registry row and a portal link, not a module.

Docs to read before step 5: Agents SDK MCP client (how `addMcpServer` attaches the two Access headers), Agents testing guide, agent skills runtime page, MCP server portals (service tokens, aliases, adding a server). Before step 8: Cursor cloud-agent API reference for the request body, status values, and auth header.

---

## 17. Open decisions

- **Website fetch from the agent (5.2 step 2).** Closed. `handoff-agent` sets `global_fetch_strictly_public`.
- **Brief approval default.** `client` is written here. If most clients should not see the PRD, flip the default to `staff` before the migration ships; it is one line.
- **Round reset point (10.1).** Resetting from the copywriting step is a guess. If research often needs redoing on feedback, make the reset step a field on `skills_json`.
- **Agent host.** `agent.abra-ca-dabra.app` or the workers.dev host. Wakes are signed either way; a zone route is tidier for logs.
- **Service-token headers on `addMcpServer`.** Closed. `agents` 0.26.0 accepts `{ transport: { headers } }`. The worker sends the two Access headers that way.
- **Portal hostname.** Closed. The portal answers at `https://mcp.abra-ca-dabra.app/mcp` (confirmed 2026-10-07: DNS to Cloudflare, `/mcp` returns 401 `invalid_token`, protected-resource metadata names that URL). Production `MCP_PORTAL_URL` stays empty until the service token and the `handoff` upstream are linked. The test config uses `https://portal.example.invalid/mcp`. Further servers follow section 2.4.
- **Connector host.** `connectors.abra-ca-dabra.app` is the planned hostname for `handoff-connectors`. It is not created yet.
