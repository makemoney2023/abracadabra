# Agency dashboard gameplan

One place to see every lead, every client, and all the work. This is the source of truth.
Everything runs on Cloudflare.

Status: steps 1, 2, 3, 4, and 5 are in the apps. Step 3 is the lead intake bridge. The Readiness Check POSTs a signed body to `https://handoff.abracadabra-ai.workers.dev/api/intake/assessment` and `/api/intake/booking` when `HANDOFF_INTAKE_ORIGIN` and `INTAKE_SIGNING_SECRET` are set. The `handoff` worker consumes queue `lead-intake`. `handoff-hq` can enqueue the same queue and does not consume it. Step 4 is the pipeline at `/leads`: a stage board, a list with stage, source, and owner filters, and a won move that turns a lead into a client, then a project, then a space. Step 5 is Today at `/` on the staff host, open work at `/work`, and a project page at `/projects/[id]` with milestones, tasks, and status updates. Staff pages use a sidebar (Today, Leads, Clients, Work, Spaces). Until `hq.abra-ca-dabra.app` is a zone on this account, staff use `https://handoff-hq.abracadabra-ai.workers.dev`. Steps 6 to 12 are not built. Decisions D1 to D11 are all made (section 10). Section 12 is the Cloudflare Agent and client email, including how the skill library is wired in. Sending that mail waits on the same zone move. The agent worker is not built.

## 1. What it does

1. A person takes the Readiness Check on the marketing site. They become a **lead**.
2. We talk to them. They move through **stages** (new, contacted, call booked, proposal, won, lost).
3. When they say yes, the lead becomes a **client**.
4. A client has **projects**. A project has **tasks** and **milestones**.
5. A client has one or more **Handoff spaces** for files. The dashboard links to them.
6. Every call, email, note, file, and stage change goes on the client's **timeline**.
7. We send **invoices** and record **payments** against each client and project.
8. A Cloudflare Agent runs the judgment work through MCP: it reads the client, drafts the next
   email or status update, and can move stages, add tasks, and draft invoices. A person sends
   anything the client will see. Every change is on the timeline with the agent's name on it.
9. A client's **GitHub repos** are linked to their record (and to a project when it fits). Pull
   requests, merges, releases, and deploys show on the client timeline. The repos live in our GitHub
   org, and we do the work in them (D10).
10. When work is ready, we **publish it to the client's Handoff space** as **finished work**: social
    posts, ads, videos, pages, and files, shown the way they will look live. The client approves each
    piece or asks for changes. Their answer lands on the timeline.

If it is not in the dashboard, it did not happen.

## 2. Where it lives

Build the dashboard **inside the Handoff Worker** (`handoff/`). Do not start a new app (D1).

Two front doors, one Worker (D3):

- **`hq.abra-ca-dabra.app`**: the staff dashboard. Staff only.
- **The Handoff domain**: clients only. Client spaces (`/w/[slug]`), invites, and client login stay here.

The Worker picks pages by host name. Staff pages answer only on `hq`. Client pages answer only on the
Handoff domain. Old `/admin` links on the Handoff domain redirect to `hq`.

Why:

- Handoff already has staff login (Magic password), admin roles, D1, R2, Workers AI, and the MCP server.
- Clients and Handoff spaces need to join in one database. Same D1 means plain SQL joins, no sync.
- One deploy, one login, one place to fix bugs.

Routes:

| Host and path | Who | What |
|---|---|---|
| `hq` `/` | staff | Today screen (what needs doing) |
| `hq` `/leads` | staff | Pipeline board and list |
| `hq` `/clients` | staff | Client list |
| `hq` `/clients/[id]` | staff | Client page: contacts, deals, projects, spaces, invoices, timeline |
| `hq` `/projects/[id]` | staff | Project page: milestones, tasks, status updates, files |
| `hq` `/work` | staff | All open tasks across clients, by owner and due date |
| `hq` `/deliverables/[id]` | staff | Finished work: build, preview as the client sees it, publish |
| `hq` `/invoices` | staff | All invoices: draft, sent, late, paid |
| `hq` `/spaces` | staff | Handoff space admin (today's `/admin`, moved) |
| `hq` `/settings/keys` | super admin | MCP keys and their scopes |
| `/api/intake/*` on the Handoff host (and on `hq`) | signed senders only | Lead and booking intake (section 4). Signing is the wall. No staff cookie. |
| `hq` `/api/mcp` | MCP keys only | Agent tools (section 7) |
| `hq` `/api/github/webhook` | GitHub only (signed) | Repo events for the timeline (section 7) |
| `hq` client page, Email | staff | Drafts waiting, and mail already sent (section 12) |
| `handoff-agent` email handler | Email Service | Client mail in, once the zone is here (section 12) |
| `hq` `/settings/github` | super admin | GitHub App install and repo linking |
| Handoff `/w/[slug]` | clients | Handoff space, as today |
| Handoff `/w/[slug]/work` | clients | Finished work list, newest first |
| Handoff `/w/[slug]/work/[id]` | clients | One piece of finished work: preview, approve, ask for changes |
| Handoff `/w/[slug]/media/[itemId]/[file]` | clients and staff | Finished-work images and video from R2, after an access check |

Clients never see CRM pages. Staff pages check the `staff` role on every request. The staff session
cookie is set for `hq` only, so a client page can never read it.

## 3. Cloudflare pieces

| Need | Cloudflare service |
|---|---|
| App and API | Worker (Next.js via OpenNext), already deployed |
| Records | D1 `handoff` (same database) |
| Files | R2 (already used by Handoff) |
| Lead intake buffer | Queue `lead-intake` |
| Fixed jobs (stale leads, due tasks, late invoices, digest flags) | Cron Trigger on the Handoff Worker. It wakes the agent. It does not write client-facing copy. |
| Agent that drafts and talks | Worker `handoff-agent` (Agents SDK). One instance per client. It calls MCP. It does not own records. |
| GitHub webhook buffer | Queue `github-events` |
| Client email in and out | Cloudflare Email Service on `handoff-agent`, after `abra-ca-dabra.app` is a zone on this account |
| Handoff product mail (invites, file notices) | The sender Handoff already uses. That is not the client-conversation channel. |
| Invoice PDFs | R2 |
| Finished-work media (images, video, posters) | R2, streamed by the Worker with range requests |
| Staff host | Custom domain `hq.abra-ca-dabra.app` on the same Worker. Until that zone is here, worker `handoff-hq` at `https://handoff-hq.abracadabra-ai.workers.dev` |
| Bot check on survey | Turnstile |
| Summaries and search | Workers AI through AI Gateway (already set up) |
| Readiness Check | Move from Vercel + Supabase + Inngest to a Worker + D1 (section 4) |

## 4. Getting survey leads in

Today the Readiness Check runs on Vercel, Supabase, and Inngest. "Everything on Cloudflare" means it moves.
Do it in two steps so leads never stop flowing.

### Step A: bridge (small, ships first)

- The Readiness Check keeps running where it is.
- When an assessment is completed (the existing `assessment-completed` Inngest function), it also POSTs to
  `POST https://handoff.abracadabra-ai.workers.dev/api/intake/assessment` (`HANDOFF_INTAKE_ORIGIN`).
  The function skips the POST when the saved row has no email. Opting in to email sends the same event
  again, so the address can arrive after the first completion. If `HANDOFF_INTAKE_ORIGIN` or
  `INTAKE_SIGNING_SECRET` is unset, the check skips the POST and the person's result still saves.
- The request is signed: `X-Intake-Signature` is hex HMAC-SHA256 of the raw body with
  `INTAKE_SIGNING_SECRET`, plus `X-Intake-Timestamp` in unix milliseconds. Reject a bad signature or a
  timestamp more than 5 minutes off. A missing secret rejects the request.
- The endpoint puts the message on the `lead-intake` Queue and returns 202 right away. The `handoff`
  worker consumes that queue. Failed writes retry up to 3 times, then go to `lead-intake-dlq`. A bad
  payload is dropped. `handoff-hq` can produce to the same queue and does not consume it.
- The Queue consumer writes to D1. It matches on email, then on domain. A free email host is not stored
  as the company domain. It does not use the staff create path. New companies are kind `lead`, and the
  timeline actor is `system`.
  - Known contact: add the assessment to their lead and timeline.
  - Known domain, new email: same company, new person.
  - New: make a lead, a contact, a deal at stage `new` with source `readiness_check`, and an
    `assessment` row.
- The same `assessment_id` sent twice does nothing the second time, except one case: if the stored
  contact has no email and the new body has one, that email and name are filled in. Still one
  assessment row.
- Cal.com still posts to the Readiness Check. After that webhook checks Cal's signature, the check
  POSTs a signed body to `/api/intake/booking`. Handoff does not take an unsigned Cal webhook. The
  appointment provider is `calcom`. A new or moved call sets the deal to `call_booked` only when the
  stage is `new` or `contacted`. A cancelled call updates the appointment and leaves the deal stage.
- We start fresh (D7). Only leads that come in after the bridge ships go into the dashboard. Old
  Supabase leads are not copied over.

### Step B: move the Readiness Check onto Cloudflare

- Port `readiness-check/` to a Worker (OpenNext, same as Handoff) at `check.abra-ca-dabra.app`.
- Supabase tables move to the same `handoff` D1 (D2). They get a `rc_` prefix so they stay apart from
  CRM tables. The check Worker gets its own small data module that can only touch `rc_` tables and
  `intake_receipts`. It never reads client records.
- Inngest jobs become Queue consumers and Cron Triggers:
  - `run-scan`, `run-prospect` → Queue consumer `scan-jobs`
  - `assessment-completed` → writes straight to D1, no bridge needed
  - `assessment-sweep` → Cron Trigger
- Turnstile on the email gate.
- Once Step B is live, turn off the bridge and the Vercel and Supabase projects. No data moves across
  (D7). Export the old Supabase tables to a file in R2 first, as a backup only.

## 5. Data model (D1)

New migration `0005_crm.sql`. Times are unix ms, booleans 0 or 1, like the rest of Handoff.

```sql
-- A company we work with or want to work with.
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,              -- lowercased, no www
  website TEXT,
  industry TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('lead', 'client', 'past_client', 'partner')),
  owner_user_id TEXT REFERENCES staff(user_id),
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);

-- A person at an organization.
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  name TEXT,
  title TEXT,
  email TEXT UNIQUE CHECK (email IS NULL OR email = lower(email)),
  phone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  opted_in INTEGER NOT NULL DEFAULT 0 CHECK (opted_in IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One sales chance. An organization can have more than one over time.
CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('new', 'contacted', 'call_booked', 'proposal', 'won', 'lost')),
  source TEXT NOT NULL,            -- 'readiness_check', 'referral', 'manual', ...
  value_cents INTEGER,
  lost_reason TEXT,
  owner_user_id TEXT REFERENCES staff(user_id),
  next_step TEXT,
  next_step_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

-- Readiness Check result, copied in from intake.
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,             -- same id as the Readiness Check
  organization_id TEXT REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  domain TEXT,
  answers_json TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  total_score INTEGER,
  utm_json TEXT,
  report_url TEXT,
  completed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,          -- 'calcom'
  external_id TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  starts_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'rescheduled', 'cancelled', 'done', 'no_show')),
  UNIQUE (provider, external_id)
);

-- Paid work for a client.
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  deal_id TEXT REFERENCES deals(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'waiting_on_client', 'done', 'paused', 'cancelled')),
  owner_user_id TEXT REFERENCES staff(user_id),
  starts_at INTEGER,
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  due_at INTEGER,
  done_at INTEGER,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),       -- null = loose task on a deal or org
  milestone_id TEXT REFERENCES milestones(id),
  organization_id TEXT REFERENCES organizations(id),
  deal_id TEXT REFERENCES deals(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'blocked', 'done')),
  assignee_user_id TEXT REFERENCES staff(user_id),
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  done_at INTEGER
);

-- Link a client to its Handoff spaces. A space can belong to one client.
ALTER TABLE workspaces ADD COLUMN organization_id TEXT REFERENCES organizations(id);
ALTER TABLE workspaces ADD COLUMN project_id TEXT REFERENCES projects(id);

-- The timeline. Append only.
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  project_id TEXT REFERENCES projects(id),
  workspace_id TEXT REFERENCES workspaces(id),
  kind TEXT NOT NULL,              -- 'note', 'call', 'email', 'stage_change', 'assessment', 'booking',
                                   -- 'file_uploaded', 'request_done', 'task_done', 'status_update',
                                   -- 'invoice_sent', 'payment_received', ...
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'agent', 'system')),
  actor_id TEXT,                   -- staff user id, MCP key id, or job name
  body TEXT,
  data_json TEXT,
  created_at INTEGER NOT NULL
);

-- Money. Amounts in cents. One currency per invoice.
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,     -- 'INV-2026-0001', never reused
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  contact_id TEXT REFERENCES contacts(id),   -- who it is sent to
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'partly_paid', 'paid', 'void')),
  currency TEXT NOT NULL DEFAULT 'usd',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bp >= 0),  -- basis points; 825 = 8.25%. Off (0) by default
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  issued_at INTEGER,
  due_at INTEGER,
  sent_at INTEGER,
  paid_at INTEGER,
  pdf_r2_key TEXT,
  external_id TEXT,                -- payment provider invoice id, if any
  memo TEXT,
  created_by TEXT,                 -- actor id (staff user or MCP key)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  milestone_id TEXT REFERENCES milestones(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Next invoice number for each year. Bumped in the same batch that makes the invoice.
CREATE TABLE invoice_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL,            -- 'bank', 'card', 'check', 'cash', 'other'
  provider TEXT,                   -- null for manual (D8). 'stripe' later
  external_id TEXT,                -- provider payment id
  received_at INTEGER NOT NULL,
  recorded_by TEXT,                -- actor id
  note TEXT,
  UNIQUE (provider, external_id)
);

-- Updates we post for a project. Internal ones stay on hq. Client ones also show in the
-- Handoff space and can be emailed.
CREATE TABLE status_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  health TEXT NOT NULL CHECK (health IN ('on_track', 'at_risk', 'off_track', 'done')),
  audience TEXT NOT NULL CHECK (audience IN ('internal', 'client')),
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  emailed_at INTEGER,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'agent', 'system')),
  actor_id TEXT,
  created_at INTEGER NOT NULL,
  published_at INTEGER
);

-- GitHub App installs. Today there is one: our own org (D10). The table allows more later.
CREATE TABLE github_installations (
  id INTEGER PRIMARY KEY,          -- GitHub installation id
  account_login TEXT NOT NULL,     -- GitHub user or org name
  account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
  organization_id TEXT REFERENCES organizations(id),  -- null for our own org
  suspended_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Repos linked to a client, and to a project when it fits.
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  github_repo_id INTEGER NOT NULL UNIQUE,   -- stays the same if the repo is renamed or moved
  installation_id INTEGER REFERENCES github_installations(id),
  full_name TEXT NOT NULL,                  -- 'owner/name', refreshed from webhooks
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  default_branch TEXT,
  is_private INTEGER NOT NULL DEFAULT 1,
  owned_by TEXT NOT NULL DEFAULT 'agency' CHECK (owned_by IN ('client', 'agency')),
  linked_by TEXT,                           -- actor id
  created_at INTEGER NOT NULL,
  archived_at INTEGER
);

-- Finished work we show a client: a social pack, a web page, a document. Built in a repo,
-- then published to the client's Handoff space.
CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),   -- the space the client sees it in
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('social_pack', 'website', 'document', 'other')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'changes_requested', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,       -- goes up each time we publish a new round
  source_repo_id TEXT REFERENCES repos(id),
  source_ref TEXT,                          -- commit sha the media came from
  published_at INTEGER,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'agent', 'system')),
  actor_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One piece inside a deliverable: a reel, a carousel, an ad, a page.
CREATE TABLE deliverable_items (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  version INTEGER NOT NULL,                 -- which round this item belongs to
  section TEXT,                             -- 'Organic', 'Paid', 'Week 1', ...
  format TEXT NOT NULL CHECK (format IN ('video', 'static', 'carousel', 'story', 'ad_video',
                                         'ad_static', 'ad_carousel', 'page', 'link', 'file')),
  channel TEXT,                             -- 'instagram', 'facebook', 'meta_ads', 'web', ...
  title TEXT NOT NULL,
  copy_text TEXT,                           -- caption, headline, body
  media_json TEXT NOT NULL DEFAULT '[]',    -- [{ r2_key, role: main|poster|square|slide, content_type, size, width, height }]
  link_url TEXT,                            -- for 'page' and 'link' items
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'changes_requested')),
  sort INTEGER NOT NULL DEFAULT 0
);

-- What the client (or staff) said about the work. Append only.
CREATE TABLE deliverable_feedback (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  item_id TEXT REFERENCES deliverable_items(id),   -- null = about the whole deliverable
  version INTEGER NOT NULL,                        -- the round they were looking at
  author_kind TEXT NOT NULL CHECK (author_kind IN ('client', 'staff')),
  author_id TEXT,                                  -- client user id or staff user id
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'changes', 'comment')),
  body TEXT,
  created_at INTEGER NOT NULL
);

-- Write calls we already ran, so a retried agent call does nothing twice.
CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (actor_id, key)
);

-- Intake messages we already handled, so retries do nothing.
CREATE TABLE intake_receipts (
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (source, external_id)
);
```

Plus indexes on every foreign key, `deals(stage, updated_at)`, `tasks(assignee_user_id, status, due_at)`,
`activities(organization_id, created_at)`, `invoices(status, due_at)`,
`status_updates(project_id, created_at)`, `repos(organization_id)`,
`deliverables(workspace_id, status, published_at)`, `deliverable_items(deliverable_id, version, sort)`,
and `deliverable_feedback(deliverable_id, created_at)`.

GitHub events reuse `intake_receipts` with `source = 'github'` and the delivery id, so a redelivered
webhook does nothing twice.

`knowledge_keys` (from `0004_knowledge.sql`) gets a `scopes` column: a comma list of `read`, `work`,
`billing`, and `code`. Old keys default to `read`. It also gets a `can_publish` flag (0 or 1), off by
default.

Rules:

- An organization's `kind` flips to `client` when one of its deals is marked `won`. That also offers
  to make a project and a Handoff space in one step.
- Existing Handoff events (files uploaded, requests done) also write an `activities` row when the space
  has an `organization_id`. The client timeline then shows file work with no extra effort.
- Existing spaces get linked by hand once, from the client page.
- Invoice totals are worked out in code from the items, never typed in. `paid_cents` is the sum of
  payments. Status moves to `partly_paid` or `paid` on its own.
- Invoice numbers look like `INV-2026-0001` (D9). The number comes from `invoice_counters` when the
  invoice is made, so numbers never repeat. A voided invoice keeps its number.
- Tax is off unless staff set a rate on that invoice (D9). `tax_cents` is the subtotal times
  `tax_rate_bp`, rounded to the nearest cent, worked out in code.
- A sent invoice is never edited. To change it, void it and make a new one.
- Clients only ever see deliverables that are published (`published_at` set), in their own space, at
  the latest version. Drafts stay on `hq`.
- Publishing a new round bumps `version`. Old items stay for history. A client's approve or change
  request is saved with the version they saw, so an old answer can never approve new work.
- When every item in the latest round is approved, the deliverable moves to `approved` on its own.
  Any change request moves it to `changes_requested`.
- Every write, by a person, an agent, or a job, adds one `activities` row in the same D1 batch.

## 6. Screens

All plain words, grade 5 reading level, same shadcn look as Handoff admin.

**Today (`hq /`)**
- New leads since you last looked
- Calls booked in the next 7 days
- Tasks due or late, yours first
- Deals with no next step, or a next step in the past
- Spaces waiting on the client (open requests)
- Invoices late or due this week
- What agents did since you last looked

**Leads (`hq /leads`)**
- Board with one column per stage. Drag to move. Moving writes a `stage_change` activity.
- List view with filters: stage, owner, source, score, date.
- Lead card shows name, company, score, last touch, next step.

**Client page (`hq /clients/[id]`)**
- Top: name, website, owner, kind, main contact.
- Tabs: Overview, Contacts, Deals, Projects, Spaces, Repos, Deliverables, Invoices, Timeline.
- Repos tab: linked repos with last push, open pull requests, and latest release. "Link a repo"
  picks from repos our GitHub App can see. Each repo can be tied to one project.
- Overview shows the latest Readiness Check scores, open tasks, and a short AI summary of the timeline
  (Workers AI, marked "AI summary").
- Add note, log call, add task right from the page.

**Project page (`hq /projects/[id]`)**
- Milestones with tasks under each. Check off tasks.
- Linked Handoff space: open requests, recent files, storage used.
- Linked repos: open pull requests and recent merges, so status updates can say what shipped.
- Status and due date at the top.
- Deliverables: each one with its status (draft, published, changes asked, approved) and latest
  feedback.
- Status updates: write one, pick internal or client, then publish. Client updates show in the
  Handoff space and can be emailed. Agent drafts wait here for a person to publish.

**Deliverable builder (`hq /deliverables/[id]`)**
- Pick the kind (social pack, website page, video, design, other) and the project.
- Add items: upload media, or pull them from a repo (see section 7). Each item has a format (for
  example IG video, Meta ad carousel), a title, its copy, and its media.
- "Preview as client" shows it exactly as the client will see it.
- Publish makes it show in the client's Handoff space and can email the main contact. A new publish
  after changes makes a new version; feedback stays tied to the version it was about.

**Finished work for clients (`/w/[slug]/work` and `/w/[slug]/work/[id]`)**
- Lives in Handoff. Only people with access to that space can see it.
- The list page shows every published deliverable with a cover image, status, and date.
- The deliverable page works like the social preview in the renewimplants repo:
  - Tabs by format (Instagram, Facebook, Stories, Meta ads, and so on).
  - Each post shows in a phone frame, the way it will look in the feed.
  - Videos play with a poster image first. Carousels swipe. Stills show full size.
  - The caption, headline, and call to action show under each item.
- Buttons on each item: "Approve" and "Ask for changes" (with a note). One "Approve all" at the top.
- Every click writes an `activities` row, so staff see it on the timeline and the Today screen.

**Work (`hq /work`)**
- Every open task across all clients. Group by person or by client. Filter late, this week, blocked.

**Invoices (`hq /invoices`)**
- List by status: draft, sent, late, paid. Totals owed and paid this month.
- Make an invoice from a project or milestone. Add lines, preview, send. Sending saves a PDF to R2
  and emails the client contact.
- Record a payment by hand (amount, date, method). Stripe comes later as an add-on (D8).
- Clients see their invoices in their Handoff space, read only.

**Agent log**
- Timeline filter "by agents". Each row shows the key name, the tool, and what changed.
- Undo for simple changes (stage, task status). Money changes are never undone; void and redo.

**Search**
- One box in the header. Finds organizations, contacts, deals, and projects by name, email, or domain.

## 7. Handoff and MCP

- Creating a space from a won deal fills in name, slug, and sender from the organization.
- The space page header shows a link back to the client for staff only.
- Client pages in a Handoff space show published client status updates, the client's invoices, and
  published finished work at `/w/[slug]/work` (section 6).

### MCP tools for running the work (D5)

Agents get full read and write so they can run and automate the work. The MCP server moves to
`hq /api/mcp` and keeps the existing file tools (`search_files`, `list_files`). Each key has scopes.
A tool call with a key that lacks the scope gets a plain error.

| Scope | Tools |
|---|---|
| `read` | `get_client`, `search_crm`, `list_deals`, `list_open_work`, `get_project`, `client_timeline`, `list_invoices`, plus the file tools |
| `work` | `create_lead`, `update_contact`, `move_deal_stage`, `add_note`, `log_call`, `create_project`, `create_milestone`, `create_task`, `update_task` (status, owner, due date), `post_status_update`, `create_space_request`, `log_inbound_email`, `save_email_draft` |
| `work` (finished work) | `create_deliverable`, `add_deliverable_item`, `sync_deliverable_from_repo`, `list_deliverable_feedback`, and `publish_deliverable` (needs `can_publish`) |
| `billing` | `create_invoice` (draft), `send_invoice`, `record_payment`, `void_invoice` |
| `code` | `open_issue`, `open_pr`, `comment_on_pr` on linked repos |

`sync_deliverable_from_repo` reads a manifest file in the repo at one commit (for example
`deliverables/social-preview/manifest.json`). It copies only the media and copy files the manifest
lists into R2. It never copies source code. The deliverable keeps the repo, path, and commit it came
from.

Rules for every write tool:

- Goes through the same `crm.ts` functions the screens use. No second path into the data.
- Takes an `idempotency_key`. The same key twice returns the first result and changes nothing.
- Writes an `activities` row with `actor_kind = 'agent'` and the key id, in the same batch.
- Rate limit per key (for example 60 writes a minute). Over the limit gets a plain error.
- Returns the changed record so the agent can check its work.
- Client-facing steps have a guard. `post_status_update` with `audience = 'client'`, `send_invoice`,
  and `publish_deliverable` make drafts unless the key has the `can_publish` flag. Staff turn that on
  per key once they trust it.

### Automation

Fixed jobs stay on Cron and Queues. Judgment stays on the Cloudflare Agent (section 12).

- Cron finds the work: Monday status updates for active projects, deals with no next step, invoices
  3 days before and 7 days after the due date, and the daily staff digest. It wakes `handoff-agent`
  with a signed request. It does not draft client copy itself.
- There is no `agent-actions` Queue. The agent keeps its own follow-up schedule inside the instance.
  That schedule survives sleep.
- The digest and the flags write as `actor_kind = 'system'`. Drafts the agent saves write as
  `actor_kind = 'agent'`.
- Sending mail to a client is not an MCP tool. Staff send it from hq (section 12).

### GitHub repos

Each client's repos link to their client record, and to a project when it fits. All client repos
live in our GitHub org and we own them (D10). We do the work in these repos, and some of it is
finished work to show the client, like `social-preview` in the renewimplants repo.

- **GitHub App.** We make one GitHub App and install it once, on our org. It has full access to the
  repos it is installed on: metadata, contents (read and write), pull requests, issues, checks,
  deployments, and releases.
- **Linking.** A super admin opens `hq /settings/github` to see each install and its repos. Staff link a
  repo from the client's Repos tab. Repos are keyed by GitHub's repo id, so a rename or move keeps the
  link.
- **Events.** GitHub sends webhooks to `hq /api/github/webhook`. We check the `X-Hub-Signature-256`
  header with `GITHUB_WEBHOOK_SECRET`, then put the event on the `github-events` Queue and return
  fast. Bad signatures get a 401. Repeat deliveries are dropped using the delivery id in
  `intake_receipts`.
- **Timeline.** The consumer writes `activities` rows (`actor_kind = 'system'`) for linked repos only:
  pull request opened, pull request merged, release published, deploy succeeded or failed, and pushes
  to the default branch (one row per push, not per commit). Rename and transfer events update
  `full_name`. Uninstall or suspend marks the install so its repos show as disconnected.
- **MCP.** `read` adds `list_repos` and `repo_activity`. `work` adds `link_repo` and `unlink_repo`.
  `code` adds `open_issue`, `open_pr`, and `comment_on_pr`. Agents can use merged pull requests to
  draft the weekly status update.
- **Finished work from a repo.** `sync_deliverable_from_repo` (and the "Pull from repo" button in the
  deliverable builder) turns a repo folder into a deliverable, using its manifest. See section 6.
- **No code in our data.** We store repo names and event summaries (titles, numbers, links, authors),
  never file contents or diffs. Code never goes into AI Gateway prompts. The one exception is
  finished-work media and copy files a manifest lists, which go to R2 so the client can see them.

## 8. Login and safety

- Staff only, using the same Magic password login and `staff` table.
- Every CRM read and write goes through one module (`src/db/crm.ts`) that checks the staff session,
  like `src/db/records.ts` does today. D1 has no row rules, so this is the wall.
- Staff pages only answer on `hq`. The staff cookie is scoped to `hq`. Client pages only answer on the
  Handoff domain.
- Intake endpoints only accept signed requests. No session cookie works on them.
- MCP keys: only super admins make, scope, and revoke them. Keys are stored hashed and shown once.
  Never log a full key, only its id and last 4 characters.
- Money: amounts are whole cents, never floats. For now staff record payments by hand. When the Stripe
  add-on lands, its webhook is signed and deduped by provider id, and no card numbers ever touch our
  Worker; Stripe holds them.
- Secrets added now: `INTAKE_SIGNING_SECRET` (both Handoff Workers, and the Readiness Check when it
  should post). The name is in `.env.example` and the Handoff README. The value stays a Worker secret.
  The check also needs `HANDOFF_INTAKE_ORIGIN`. `STRIPE_WEBHOOK_SECRET` is added only when the Stripe
  add-on ships.
- Agent secrets, added with step 10: `AGENT_WAKE_SECRET` (the cron caller and `handoff-agent`) and
  `AGENT_MCP_TOKEN` (the agent's MCP key, on `handoff-agent` only). The dashboard stores that key
  hashed, the same as other MCP keys.
- Email secrets, added with step 11: `EMAIL_SECRET` on `handoff-agent`, used to sign reply routing.
  The send binding is `EMAIL`. Do not put a send key in the Next.js app.
- GitHub secrets: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. The App has
  write access to our org, so the private key lives in Worker secrets only. We make a short-lived
  install token per call and never store or log it. Add to `.env.example` and the README.
- Finished work: the media route checks that the viewer can see that space on every request, and
  only serves published versions to clients. R2 keys are random ids, not names, so they can't be
  guessed.
- Survey answers can hold personal info. Keep them in D1 only, never in logs or AI Gateway prompts
  without a reason. AI summaries use notes and activity text, not raw answers.
- Deleting a contact on request: remove their contact row and blank their email in assessments.

## 9. Build order

Each step ships on its own and is useful on its own.

1. **`hq` host and schema.** Add the `hq` custom domain and host routing. Move today's `/admin` to
   `hq /spaces` with a redirect. `0005_crm.sql`, `crm.ts` with tests, client list and create form.
   Link existing Handoff spaces to clients by hand.
2. **Client page and timeline.** Contacts, notes, call logs, tasks. Handoff file and request events feed
   the timeline.
3. **Lead intake bridge.** Signed `/api/intake/assessment` and `/api/intake/booking`, `lead-intake`
   Queue, consumer with dedupe. Change the Readiness Check to POST on completion. No backfill: we
   start fresh (D7).
4. **Pipeline.** Deals, stage board, won flow (deal to client to project to space). This step is in the app at `/leads`.
5. **Projects and work.** Milestones, tasks, status updates, `hq /work`, Today screen. This step is in the app: Today at `/`, open work at `/work`, and `/projects/[id]`.
6. **GitHub repos.** One GitHub App on our org with read and write access, `0006_github.sql`,
   `hq /settings/github`, signed webhook, `github-events` Queue, Repos tab on the client and project
   pages.
7. **Finished work.** `deliverables`, `deliverable_items`, and `deliverable_feedback` tables, the
   access-checked media route, the staff builder, pull from a repo manifest (like social-preview in
   the renewimplants repo), the client gallery at `/w/[slug]/work`, and approve or ask-for-changes.
8. **Invoices and payments.** Invoice screens, PDF to R2, send by email, record payments by hand,
   client read-only view in Handoff. Stripe pay links and webhook come later as an add-on (D8).
9. **MCP read and write tools.** Key scopes, all tools in section 7 including code and finished-work
   tools, idempotency, rate limits, agent log and undo. Client-facing tools start as drafts only.
   `log_inbound_email` and `save_email_draft` land with step 10, when `client_messages` exists.
10. **Agent runtime.** Worker `handoff-agent` on the Agents SDK. One instance per client. It calls
   MCP with `can_publish` off. Cron wakes it. On wake it loads the skill library index and follows
   one matching skill. It finishes the work when the steps fit the MCP tools. It writes a plan and
   a staff task when a step needs a program the Worker does not run. It saves status-update drafts,
   follow-up tasks, and email drafts. It does not send mail yet. AI client summary for staff only.
11. **Client email.** Cloudflare Email Service on `handoff-agent`: inbound handler, address routing,
   signed replies, drafts on the client page, staff press Send. Blocked until `abra-ca-dabra.app` is
   a zone on this account (SPF and DKIM). Handoff invite mail stays on its current sender.
12. **Move the Readiness Check to Cloudflare.** Worker port, `rc_` tables in the same D1, Queue for
   scans, Cron for the sweep, Turnstile. Turn off the bridge, Vercel, Supabase, and Inngest.

Each step: tests first, then code, then lint, type check, deploy, and a live check.

## 10. Decisions

Made:

- **D1. One app.** The dashboard lives in the Handoff Worker.
- **D2. Same D1.** The Readiness Check uses the `handoff` D1, with `rc_` tables.
- **D3. Two hosts.** Staff use `hq.abra-ca-dabra.app`. Clients keep the Handoff domain.
- **D4. Stages.** `new, contacted, call_booked, proposal, won, lost`.
- **D5. Full MCP writes.** Agents can run the work: stages, tasks, status updates, invoices. Scoped
  keys, full audit, drafts first for anything a client sees.
- **D6. Money.** Invoices and payments are in this plan (section 5 and step 8).
- **D7. Start fresh.** No backfill of old Supabase leads.
- **D8. Payments by hand now.** Staff record payments. Stripe pay links and webhook come later as an
  add-on.
- **D9. Invoice numbers and tax.** Numbers look like `INV-2026-0001`. Tax is optional per invoice and
  off by default. All money is in cents.
- **D10. GitHub.** Client repos live in our org and we own them, so the App has full read and write
  access. We do the work in those repos and publish finished work (like social-preview) to the
  client's Handoff space.
- **D11. Agent and email.** The agent is its own Worker (`handoff-agent`) on the Cloudflare Agents
  SDK. The dashboard stays the only app that owns records. The agent reads and writes only through
  MCP. Client conversation mail uses Cloudflare Email Service, and only after the domain is a zone
  on this account. Anything a client would read stays a draft until a person sends it (D5).

## 11. Risks

- **Two homes for leads during the bridge.** Until step 12, the Readiness Check still has its own copy.
  The dashboard is the source of truth for everything after intake. Staff should not edit leads in the
  old `/ops` inbox once step 3 ships.
- **D1 size and speed.** D1 is fine for an agency's volume. Keep the timeline indexed and paged.
- **Duplicate people.** Same person, two emails. Matching by email then domain catches most. Add a
  merge button on the client page in step 2.
- **Personal data.** Survey answers and contact info sit in one place now. Keep access staff-only and
  keep it out of logs.
- **Agent mistakes.** An agent with write access can make a mess fast. Scopes, rate limits, drafts for
  anything a client sees, the agent log, and undo keep it small. Start new keys with `read` only.
- **Money errors.** Totals from items, cents only, sent invoices locked, payments deduped. Void and
  redo instead of edit.
- **Two hosts, one app.** A bug in host routing could show a staff page on the client domain. Test
  every staff route returns 404 on the Handoff host.
- **Repo write access.** The App can change code in every repo in our org. Keep the private key in
  Worker secrets only, make tokens per call, and give agents the `code` scope only when needed. Never
  copy code into D1, logs, or AI prompts. The only files we copy are the media and copy files a
  manifest lists for finished work.
- **Wrong client sees finished work.** Check space access on every media request, serve clients only
  published versions, and use random R2 keys. Test that one client can't load another's media.
- **Approving an old version.** Feedback is tied to a version. If we publish a new one, old approvals
  don't carry over.
- **Big videos.** Set size limits, stream with range requests, and show a poster image first.
- **Lost intake.** If the Queue consumer fails, the message retries. Failed messages go to a dead
  letter queue and show on the Today screen.
- **Agent mail to the wrong person.** The agent never calls send. Staff send one approved draft.
  The From domain is the domain that received the mail. Unknown agent ids are rejected.
- **Mail loops.** Auto-replies are logged and not answered. A thread stops at 100 References.
- **Email before the zone moves.** `abra-ca-dabra.app` is not a zone on this account yet, so Email
  Service cannot add SPF and DKIM. Step 10 can ship without sending. Step 11 waits.
- **Two memories.** The agent keeps a scratch pad. D1 is the source of truth. If they disagree, D1
  wins. The agent has no D1 binding.

## 12. Agents and client email

Sources: [Cloudflare Agents](https://developers.cloudflare.com/agents/) and
[Email Service email handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/).

### What each piece is for

Cloudflare splits this into three kinds of work. We keep that split.

- **Workflows and Queues** are fixed paths. Intake dedupe, invoice numbers, and GitHub webhook
  dedupe stay there. They do the same thing every time.
- **The Agent** is the judgment. It reads a client, picks a next step, and drafts the words. The
  same input can lead to a different draft. That is expected.
- **A person** sends anything the client will see. The agent is not a co-pilot chat box on the
  marketing site. Clients reach it by email, once step 11 is on.

The dashboard stays the source of truth (D1). The agent is a second Worker because the Agents SDK
runs as its own Durable Object, not as a Next.js route (D11). It is not a second CRM.

### The agent worker

Worker name `handoff-agent`. One class, `ClientAgent`. One instance per organization id.

Each instance has its own SQLite scratch pad for the conversation it is in. It sleeps when idle
and wakes on a signed request, on its own schedule, or on inbound mail. The scratch pad is not a
record. The worker has no D1 binding and no R2 binding. Every client record, including raw mail,
is written by an MCP tool on the dashboard.

On start it connects to MCP:

- URL: the staff host `/api/mcp` (`https://handoff-hq.abracadabra-ai.workers.dev/api/mcp` until the
  zone moves, then `https://hq.abra-ca-dabra.app/api/mcp`).
- Auth: `Authorization: Bearer` with `AGENT_MCP_TOKEN`, via `addMcpServer`.
- Tools: `this.mcp.getAITools()`, passed into Workers AI on the `AI` binding.
- Key scopes: `read` and `work`. `can_publish` stays off. No `billing` send and no `code` until a
  person turns those on for a different key. This key cannot send client mail, because send is not
  an MCP tool.

The loop is our own, on the Agents SDK. We do not use a hosted harness. The draft rule has to live
in our code: the model may call `save_email_draft` and `post_status_update` (audience client, which
stays a draft). It may not mark a draft approved.

Cron on the Handoff Worker finds due work and POSTs to the agent with `AGENT_WAKE_SECRET`. The body
names the organization id and the reason (`status`, `follow_up`, `invoice_reminder`, `digest`).
The agent loads the client through MCP and writes drafts back through MCP.

### What it drafts

- Monday: a client status update per active project. Saved as a draft.
- A deal with no next step: a follow-up task and an email draft. No send.
- A client reply: a short draft answer, after the inbound rules below.
- An invoice reminder: a draft only. `send_invoice` still needs `can_publish` on a different key.
- A staff-only summary on the client page. Notes and timeline text only. Never raw survey answers.

### Client email

This waits until `abra-ca-dabra.app` is a zone on this Cloudflare account. Email Service needs the
domain onboarded, plus SPF and DKIM. Those records cannot be added while DNS is still at Vercel.
Do not send client mail from `workers.dev`. Do not add a second email product for this channel.
Handoff invite and file mail keeps the sender it has now.

When the zone is here:

1. Onboard the domain in Email Service. Send from `mail.abra-ca-dabra.app` so product mail and
   client conversation mail stay apart.
2. Add a `send_email` binding named `EMAIL` on `handoff-agent`.
3. Add a routing rule that delivers inbound mail to that Worker's `email()` handler.
4. `email()` calls `routeAgentEmail`. Resolver order:
   - Signed reply first (`createSecureReplyEmailResolver` with `EMAIL_SECRET`, max age 7 days).
     `sendEmail` stamps `X-Agent-Name` and `X-Agent-ID`. A bad or expired signature does not pick
     an instance.
   - Then the address (`createAddressBasedEmailResolver`).
     `client+{organizationId}@mail.abra-ca-dabra.app` wakes `ClientAgent` for that id.
   - `studio@mail.abra-ca-dabra.app` looks up the sender with MCP `search_crm`. A known contact
     wakes that client's agent. An unknown sender is logged for staff and gets no draft.
   - No match: `setReject`. Do not forward unknown ids.

Inbound handling, inside `onEmail`:

- Parse the raw message with `postal-mime`.
- If `isAutoReplyEmail` matches, call `log_inbound_email` and stop. Do not draft and do not answer.
- If the thread already has 100 References, call `log_inbound_email` and stop.
- Call `log_inbound_email`. That tool stores the raw MIME in R2 under a random key, the short text
  in `client_messages` (state `received`), and an `activities` row, kind `email`, actor `agent`.
- Call `save_email_draft` for the reply, state `draft`. Do not call `reply()` in this turn.

`message.reply()` only works inside the inbound event, and only once. It also requires a valid
DMARC result, a recipient that is the original sender, and a From domain that matches the domain
that received the mail. Staff approve later, so the real send uses `sendEmail` on the `EMAIL`
binding, with `In-Reply-To` and `References` set, From on `mail.abra-ca-dabra.app`.

### Send

1. The agent saves a draft through `save_email_draft`.
2. Staff see it on the client page. They can edit the words.
3. Staff press Send. hq marks that row approved.
4. hq calls the agent with `AGENT_WAKE_SECRET` and the message id.
5. The agent reads the row through MCP. If it is not approved, it does not send.
6. It sends, then MCP marks the row sent and adds the timeline row.

The agent cannot approve its own draft.

### Messages table

Ships with step 10, with `log_inbound_email` and `save_email_draft`, so drafts have a home before
mail can send. Step 11 turns inbound routing and sending on. Not part of `0005_crm.sql`.

```sql
CREATE TABLE client_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  contact_id TEXT REFERENCES contacts(id),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  state TEXT NOT NULL CHECK (state IN ('draft', 'approved', 'sent', 'received', 'rejected')),
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  raw_r2_key TEXT,
  agent_id TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  UNIQUE (message_id)
);
```

`message_id` is unique so the same inbound mail stored twice does nothing the second time.
`approved` is set only by a staff action. The agent key cannot set it.

### Checks

- A plus-address with a real organization id wakes that instance. A bad id is rejected.
- A reply with a bad signature does not wake an instance.
- An auto-reply is stored and does not create a draft.
- A draft stays `draft` until a staff action sets `approved`.
- The wake call refuses to send a row that is not `approved`.
- MCP writes still go through `crm.ts`. The agent Worker has no D1 binding and no binding to the client file bucket. It has one read-only R2 binding, `SKILLS`, for the skill library.

### Skills

The skill library is the SourceControl `skills/` copy in this repo. The files sit at `.cursor/skills/` (724 `SKILL.md` files). That path is where the copy was placed. The Cloudflare agent is a reader of those same files. The org pack (`skills/org`, 46 files) stays in SourceControl and is not in this copy.

Each file is a procedure: a `name`, a one-line `description`, and the steps. The packs cover sales, finance, marketing, ads, SEO, research, operations, delivery, video, and CAD. Examples already in the tree: account research, a pitch, an invoice memo, a campaign, a status note, a shot list.

The agent worker does not bundle the tree into the script.

At step 10, a publish step reads every `SKILL.md` and writes two things into R2 bucket `handoff-skills`:

- `skills/index.json` — one row per file: path, name, description, pack.
- The `SKILL.md` body, under the same path.

`handoff-agent` binds that bucket as `SKILLS`, read only. The client file bucket stays off this worker.

On wake, `ClientAgent` loads the index (names and descriptions only). It picks the one skill whose description matches the current task: a staff task, an inbound note, or a cron wake. It then reads that one file. It does not put the whole library in the prompt. It cannot add or delete a skill. A new skill lands by updating the folder and publishing the bucket again. A person can leave a pack out of the publish step.

After it has the file, it does one of two things:

- **Complete.** Every step can be done with Workers AI plus the MCP tools in this plan (`move_deal_stage`, `add_note`, `create_task`, `post_status_update`, `save_email_draft`, `create_invoice`, and the GitHub and finished-work tools). The agent follows the skill and writes the result. `can_publish` stays off. Anything a client would read stays a draft until a person sends it.
- **Plan.** A step needs a program the isolate does not run: a browser, ffmpeg, a design app, a CAD kernel, or a local CLI. The agent follows the skill far enough to write the plan (steps, prompts, files, checks) and opens a staff task through `create_task` that names the skill path. It does not mark that task done.

Sales, finance, marketing, research, and ops skills are eligible to complete when their steps fit the tools. Video, CAD, Remotion, scroll, and design-tool skills plan, and they can still complete the writing part (the brief, the shot list, the prompts) as a draft or a task.

The loader ships with step 10. This section is the contract. The app does not publish the bucket yet, because the agent worker is not built.
