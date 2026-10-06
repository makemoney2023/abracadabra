# Agency dashboard gameplan

One place to see every lead, every client, and all the work. This is the source of truth.
Everything runs on Cloudflare.

Status: plan. Nothing here is built yet.

## 1. What it does

1. A person takes the Readiness Check on the marketing site. They become a **lead**.
2. We talk to them. They move through **stages** (new, talking, proposal, won, lost).
3. When they say yes, the lead becomes a **client**.
4. A client has **projects**. A project has **tasks** and **milestones**.
5. A client has one or more **Handoff spaces** for files. The dashboard links to them.
6. Every call, email, note, file, and stage change goes on the client's **timeline**.

If it is not in the dashboard, it did not happen.

## 2. Where it lives

Build the dashboard **inside the Handoff Worker** (`handoff/`). Do not start a new app.

Why:

- Handoff already has staff login (Magic password), admin roles, D1, R2, Workers AI, and the MCP server.
- Clients and Handoff spaces need to join in one database. Same D1 means plain SQL joins, no sync.
- One deploy, one login, one place to fix bugs.

Routes:

| Path | Who | What |
|---|---|---|
| `/admin` | staff | Today screen (what needs doing) |
| `/admin/leads` | staff | Pipeline board and list |
| `/admin/clients` | staff | Client list |
| `/admin/clients/[id]` | staff | Client page: contacts, projects, spaces, timeline |
| `/admin/projects/[id]` | staff | Project page: tasks, milestones, files |
| `/admin/work` | staff | All open tasks across clients, by owner and due date |
| `/api/intake/assessment` | Readiness Check only | Signed lead intake (see section 4) |
| `/w/[slug]` | clients | Handoff space, as today |

Clients never see CRM pages. Staff pages check `staff` role on every request, same as `/admin` today.

## 3. Cloudflare pieces

| Need | Cloudflare service |
|---|---|
| App and API | Worker (Next.js via OpenNext), already deployed |
| Records | D1 `handoff` (same database) |
| Files | R2 (already used by Handoff) |
| Lead intake buffer | Queue `lead-intake` |
| Daily jobs (stale leads, due tasks, digest) | Cron Trigger |
| Email out | Existing Handoff email sender |
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
- Supabase tables move to D1. Either the same `handoff` D1 (simplest) or a separate `readiness` D1
  that only talks to the dashboard through the Queue (cleaner walls). See decision D2.
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
                                   -- 'file_uploaded', 'request_done', 'task_done', ...
  actor_user_id TEXT,              -- null = system
  body TEXT,
  data_json TEXT,
  created_at INTEGER NOT NULL
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
and `activities(organization_id, created_at)`.

Rules:

- An organization's `kind` flips to `client` when one of its deals is marked `won`. That also offers
  to make a project and a Handoff space in one step.
- Existing Handoff events (files uploaded, requests done) also write an `activities` row when the space
  has an `organization_id`. The client timeline then shows file work with no extra effort.
- Existing spaces get linked by hand once, from the client page.

## 6. Screens

All plain words, grade 5 reading level, same shadcn look as Handoff admin.

**Today (`/admin`)**
- New leads since you last looked
- Calls booked in the next 7 days
- Tasks due or late, yours first
- Deals with no next step, or a next step in the past
- Spaces waiting on the client (open requests)

**Leads (`/admin/leads`)**
- Board with one column per stage. Drag to move. Moving writes a `stage_change` activity.
- List view with filters: stage, owner, source, score, date.
- Lead card shows name, company, score, last touch, next step.

**Client page (`/admin/clients/[id]`)**
- Top: name, website, owner, kind, main contact.
- Tabs: Overview, Contacts, Deals, Projects, Spaces, Timeline.
- Overview shows the latest Readiness Check scores, open tasks, and a short AI summary of the timeline
  (Workers AI, marked "AI summary").
- Add note, log call, add task right from the page.

**Project page (`/admin/projects/[id]`)**
- Milestones with tasks under each. Check off tasks.
- Linked Handoff space: open requests, recent files, storage used.
- Status and due date at the top.

**Work (`/admin/work`)**
- Every open task across all clients. Group by person or by client. Filter late, this week, blocked.

**Search**
- One box in the header. Finds organizations, contacts, deals, and projects by name, email, or domain.

## 7. Handoff and MCP

- Creating a space from a won deal fills in name, slug, and sender from the organization.
- The space page header shows a link back to the client for staff only.
- The MCP knowledge server gets new read tools, scoped by key:
  - `get_client(id_or_domain)`: profile, contacts, open deals, projects
  - `list_open_work(assignee?)`: open tasks
  - `client_timeline(id, since?)`: recent activities
- Writes from MCP (add note, add task) come later and only with an admin key. See decision D5.

## 8. Login and safety

- Staff only, using the same Magic password login and `staff` table.
- Every CRM read and write goes through one module (`src/db/crm.ts`) that checks the staff session,
  like `src/db/records.ts` does today. D1 has no row rules, so this is the wall.
- Intake endpoints only accept signed requests. No session cookie works on them.
- Secrets added: `INTAKE_SIGNING_SECRET` (set on both Workers). Add to `.env.example` and the Handoff README.
- Survey answers can hold personal info. Keep them in D1 only, never in logs or AI Gateway prompts
  without a reason. AI summaries use notes and activity text, not raw answers.
- Deleting a contact on request: remove their contact row and blank their email in assessments.

## 9. Build order

Each step ships on its own and is useful on its own.

1. **Schema and client list.** `0005_crm.sql`, `crm.ts` module with tests, `/admin/clients` list and
   create form. Link existing Handoff spaces to clients by hand.
2. **Client page and timeline.** Contacts, notes, call logs, tasks. Handoff file and request events feed
   the timeline.
3. **Lead intake bridge.** Signed `/api/intake/assessment` and `/api/intake/booking`, `lead-intake`
   Queue, consumer with dedupe. Change the Readiness Check to POST on completion. Backfill existing
   Supabase leads once with a script.
4. **Pipeline.** Deals, stage board, won flow (deal to client to project to space).
5. **Projects and work.** Milestones, tasks, `/admin/work`, Today screen.
6. **Cron jobs.** Daily: stale deals, late tasks, and a short staff digest email.
7. **Move the Readiness Check to Cloudflare.** Worker port, D1 tables, Queue for scans, Cron for the
   sweep, Turnstile. Turn off the bridge, Vercel, Supabase, and Inngest.
8. **MCP tools and AI summary.** Read tools first, then the client summary.

Each step: tests first, then code, then lint, type check, deploy, and a live check.

## 10. Decisions needed

- **D1. One app or two?** Plan says the dashboard goes inside the Handoff Worker. The other choice is a
  separate dashboard Worker on its own domain that shares the D1. One app is less work.
- **D2. Readiness Check database.** Same `handoff` D1, or its own D1 that sends to the dashboard by
  Queue? Same D1 is simpler. Separate keeps public survey code away from client records.
- **D3. Domain.** Keep the dashboard at the Handoff domain under `/admin`, or give it its own name
  (for example `hq.abra-ca-dabra.app`)?
- **D4. Stages.** Are `new, contacted, call_booked, proposal, won, lost` the right stages?
- **D5. MCP writes.** Should AI tools be able to add notes and tasks, or read only?
- **D6. Money.** Track deal value only, or also invoices and payments later? Invoices are out of scope
  for this plan.
- **D7. Old data.** Backfill all Supabase leads, or only ones from the last N months?

## 11. Risks

- **Two homes for leads during the bridge.** Until step 7, the Readiness Check still has its own copy.
  The dashboard is the source of truth for everything after intake. Staff should not edit leads in the
  old `/ops` inbox once step 3 ships.
- **D1 size and speed.** D1 is fine for an agency's volume. Keep the timeline indexed and paged.
- **Duplicate people.** Same person, two emails. Matching by email then domain catches most. Add a
  merge button on the client page in step 2.
- **Personal data.** Survey answers and contact info sit in one place now. Keep access staff-only and
  keep it out of logs.
- **Lost intake.** If the Queue consumer fails, the message retries. Failed messages go to a dead
  letter queue and show on the Today screen.
