# Agency dashboard gameplan

One place to see every lead, every client, and all the work. This is the source of truth.
Everything runs on Cloudflare.

Status: plan. Nothing here is built yet. Decisions D1 to D6 are made (section 10).

## 1. What it does

1. A person takes the Readiness Check on the marketing site. They become a **lead**.
2. We talk to them. They move through **stages** (new, contacted, call booked, proposal, won, lost).
3. When they say yes, the lead becomes a **client**.
4. A client has **projects**. A project has **tasks** and **milestones**.
5. A client has one or more **Handoff spaces** for files. The dashboard links to them.
6. Every call, email, note, file, and stage change goes on the client's **timeline**.
7. We send **invoices** and record **payments** against each client and project.
8. AI agents can run the work through MCP: move stages, add and close tasks, post status updates,
   and send invoices. Every change they make is on the timeline with their name on it.

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

| Path | Who | What |
|---|---|---|
| Host and path | Who | What |
|---|---|---|
| `hq` `/` | staff | Today screen (what needs doing) |
| `hq` `/leads` | staff | Pipeline board and list |
| `hq` `/clients` | staff | Client list |
| `hq` `/clients/[id]` | staff | Client page: contacts, deals, projects, spaces, invoices, timeline |
| `hq` `/projects/[id]` | staff | Project page: milestones, tasks, status updates, files |
| `hq` `/work` | staff | All open tasks across clients, by owner and due date |
| `hq` `/invoices` | staff | All invoices: draft, sent, late, paid |
| `hq` `/spaces` | staff | Handoff space admin (today's `/admin`, moved) |
| `hq` `/settings/keys` | super admin | MCP keys and their scopes |
| `hq` `/api/intake/*` | signed senders only | Lead, booking, and payment intake (section 4) |
| `hq` `/api/mcp` | MCP keys only | Agent tools (section 7) |
| Handoff `/w/[slug]` | clients | Handoff space, as today |

Clients never see CRM pages. Staff pages check the `staff` role on every request. The staff session
cookie is set for `hq` only, so a client page can never read it.

## 3. Cloudflare pieces

| Need | Cloudflare service |
|---|---|
| App and API | Worker (Next.js via OpenNext), already deployed |
| Records | D1 `handoff` (same database) |
| Files | R2 (already used by Handoff) |
| Lead intake buffer | Queue `lead-intake` |
| Daily jobs (stale leads, due tasks, late invoices, digest) | Cron Trigger |
| Agent jobs (status updates, follow-ups) | Queue `agent-actions` |
| Email out | Existing Handoff email sender (status updates, invoices, reminders) |
| Invoice PDFs | R2 |
| Staff host | Custom domain `hq.abra-ca-dabra.app` on the same Worker |
| Bot check on survey | Turnstile |
| Summaries and search | Workers AI through AI Gateway (already set up) |
| Readiness Check | Move from Vercel + Supabase + Inngest to a Worker + D1 (section 4) |

## 4. Getting survey leads in

Today the Readiness Check runs on Vercel, Supabase, and Inngest. "Everything on Cloudflare" means it moves.
Do it in two steps so leads never stop flowing.

### Step A: bridge (small, ships first)

- The Readiness Check keeps running where it is.
- When an assessment is completed (the existing `assessment-completed` Inngest function), it also POSTs to
  `POST https://<handoff>/api/intake/assessment`.
- The request is signed: `X-Intake-Signature = HMAC-SHA256(body, INTAKE_SIGNING_SECRET)` plus a timestamp.
  Reject anything older than 5 minutes or with a bad signature.
- The endpoint puts the message on the `lead-intake` Queue and returns 202 right away.
- The Queue consumer writes to D1. It matches on email, then on domain:
  - Known contact: add the assessment to their lead and timeline.
  - New: make a lead, a contact, and an `assessment` row.
- Same `assessment_id` sent twice does nothing the second time (unique key).
- Cal.com bookings: point the booking webhook at `/api/intake/booking` with the same signing.

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
- Once Step B is live, turn off the bridge and the Vercel and Supabase projects.

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

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL,            -- 'bank', 'card', 'check', 'stripe', ...
  provider TEXT,                   -- 'stripe' or null for manual
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
`activities(organization_id, created_at)`, `invoices(status, due_at)`, and
`status_updates(project_id, created_at)`.

`knowledge_keys` (from `0004_knowledge.sql`) gets a `scopes` column: a comma list of `read`, `work`,
and `billing`. Old keys default to `read`.

Rules:

- An organization's `kind` flips to `client` when one of its deals is marked `won`. That also offers
  to make a project and a Handoff space in one step.
- Existing Handoff events (files uploaded, requests done) also write an `activities` row when the space
  has an `organization_id`. The client timeline then shows file work with no extra effort.
- Existing spaces get linked by hand once, from the client page.
- Invoice totals are worked out in code from the items, never typed in. `paid_cents` is the sum of
  payments. Status moves to `partly_paid` or `paid` on its own.
- A sent invoice is never edited. To change it, void it and make a new one.
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
- Tabs: Overview, Contacts, Deals, Projects, Spaces, Invoices, Timeline.
- Overview shows the latest Readiness Check scores, open tasks, and a short AI summary of the timeline
  (Workers AI, marked "AI summary").
- Add note, log call, add task right from the page.

**Project page (`hq /projects/[id]`)**
- Milestones with tasks under each. Check off tasks.
- Linked Handoff space: open requests, recent files, storage used.
- Status and due date at the top.
- Status updates: write one, pick internal or client, then publish. Client updates show in the
  Handoff space and can be emailed. Agent drafts wait here for a person to publish.

**Work (`hq /work`)**
- Every open task across all clients. Group by person or by client. Filter late, this week, blocked.

**Invoices (`hq /invoices`)**
- List by status: draft, sent, late, paid. Totals owed and paid this month.
- Make an invoice from a project or milestone. Add lines, preview, send. Sending saves a PDF to R2
  and emails the client contact.
- Record a payment by hand (amount, date, method). Stripe payments, if used, come in on their own.
- Clients see their invoices in their Handoff space, read only.

**Agent log**
- Timeline filter "by agents". Each row shows the key name, the tool, and what changed.
- Undo for simple changes (stage, task status). Money changes are never undone; void and redo.

**Search**
- One box in the header. Finds organizations, contacts, deals, and projects by name, email, or domain.

## 7. Handoff and MCP

- Creating a space from a won deal fills in name, slug, and sender from the organization.
- The space page header shows a link back to the client for staff only.
- Client pages in a Handoff space show published client status updates and the client's invoices.

### MCP tools for running the work (D5)

Agents get full read and write so they can run and automate the work. The MCP server moves to
`hq /api/mcp` and keeps the existing file tools (`search_files`, `list_files`). Each key has scopes.
A tool call with a key that lacks the scope gets a plain error.

| Scope | Tools |
|---|---|
| `read` | `get_client`, `search_crm`, `list_deals`, `list_open_work`, `get_project`, `client_timeline`, `list_invoices`, plus the file tools |
| `work` | `create_lead`, `update_contact`, `move_deal_stage`, `add_note`, `log_call`, `create_project`, `create_milestone`, `create_task`, `update_task` (status, owner, due date), `post_status_update`, `create_space_request` |
| `billing` | `create_invoice` (draft), `send_invoice`, `record_payment`, `void_invoice` |

Rules for every write tool:

- Goes through the same `crm.ts` functions the screens use. No second path into the data.
- Takes an `idempotency_key`. The same key twice returns the first result and changes nothing.
- Writes an `activities` row with `actor_kind = 'agent'` and the key id, in the same batch.
- Rate limit per key (for example 60 writes a minute). Over the limit gets a plain error.
- Returns the changed record so the agent can check its work.
- Client-facing steps have a guard. `post_status_update` with `audience = 'client'` and `send_invoice`
  make drafts unless the key has the `publish` flag. Staff turn that on per key once they trust it.

### Automation

- Cron and the `agent-actions` Queue run built-in jobs: Monday status-update drafts per active
  project, follow-up tasks for deals with no next step, invoice reminders 3 days before and 7 days
  after the due date, and a daily staff digest.
- Jobs write as `actor_kind = 'system'` and follow the same rules as agents.

## 8. Login and safety

- Staff only, using the same Magic password login and `staff` table.
- Every CRM read and write goes through one module (`src/db/crm.ts`) that checks the staff session,
  like `src/db/records.ts` does today. D1 has no row rules, so this is the wall.
- Staff pages only answer on `hq`. The staff cookie is scoped to `hq`. Client pages only answer on the
  Handoff domain.
- Intake endpoints only accept signed requests. No session cookie works on them.
- MCP keys: only super admins make, scope, and revoke them. Keys are stored hashed and shown once.
  Never log a full key, only its id and last 4 characters.
- Money: amounts are whole cents, never floats. Payment webhooks are signed and deduped by provider id.
  No card numbers ever touch our Worker; the provider holds them.
- Secrets added: `INTAKE_SIGNING_SECRET` (both Workers), and `STRIPE_WEBHOOK_SECRET` if we pick Stripe
  (D8). Add to `.env.example` and the Handoff README.
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
   Queue, consumer with dedupe. Change the Readiness Check to POST on completion. Backfill existing
   Supabase leads once with a script.
4. **Pipeline.** Deals, stage board, won flow (deal to client to project to space).
5. **Projects and work.** Milestones, tasks, status updates, `hq /work`, Today screen.
6. **Invoices and payments.** Invoice screens, PDF to R2, send by email, record payments by hand,
   client read-only view in Handoff. Stripe webhook if D8 says so.
7. **MCP read and write tools.** Key scopes, all tools in section 7, idempotency, rate limits, agent
   log and undo. Client-facing tools start as drafts only.
8. **Automation.** Cron and the `agent-actions` Queue: status-update drafts, follow-ups, invoice
   reminders, daily digest. AI client summary.
9. **Move the Readiness Check to Cloudflare.** Worker port, `rc_` tables in the same D1, Queue for
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
- **D6. Money.** Invoices and payments are in this plan (section 5 and step 6).

Still open:

- **D7. Old data.** Backfill all Supabase leads, or only ones from the last N months?
- **D8. Payments.** Record payments by hand only, or also take card and bank payments through Stripe
  (pay link on the invoice, signed webhook marks it paid)?
- **D9. Invoice numbers and tax.** Number format (`INV-2026-0001`?) and whether we add sales tax.

## 11. Risks

- **Two homes for leads during the bridge.** Until step 7, the Readiness Check still has its own copy.
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
- **Lost intake.** If the Queue consumer fails, the message retries. Failed messages go to a dead
  letter queue and show on the Today screen.
