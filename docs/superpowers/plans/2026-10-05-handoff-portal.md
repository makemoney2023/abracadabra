# Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-client locker where each client's invited people drop
folders of brand, photo, copy, export, source, and reference files against a
request checklist, and the operators assigned to that client pull the files
that pass a malware scan.

**Architecture:** A standalone Next.js app on Cloudflare Workers authenticates
with magic links sent through Resend. Sessions and locker records live in
Cloudflare D1. Server routes call one pure authorization function, then read
and write through record queries that return rows only for workspaces that
caller can see. The browser uploads bytes with R2 multipart upload into a
private bucket. A Cloudflare Container runs `clamd`. It is the only code that
marks a file clean. Queues and Cron Triggers send notifications and run
sweeps and purges. Operators pull batches with an export file and a
`handoff pull` command. The Strong Foam operations platform is not imported,
linked, or migrated.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Zod, Drizzle
ORM, Cloudflare D1, Cloudflare R2, Resend, ClamAV `clamd`, Cloudflare
Containers, Queues, Cron Triggers, Tailwind CSS.

**Design:** `docs/superpowers/specs/2026-10-05-handoff-portal-design.md`
in the operations repository. Requirements HND-001 through HND-058.

---

## Repository boundary

The working copy of this plan is the [`handoff/`](../../../handoff/) app in
this repository. It does not share a package, cookie, or database with the
operations site. An earlier note pointed at a separate
`makemoney2023/clienthandoff` repository; that checkout is not where this
build runs.

The new app does not depend on the operations package, does not read any
operations cookie, and does not connect to the operations database.

## Cloudflare instead of Vercel and Render

The product behavior in the spec does not change. A Cloudflare deployment
replaces the host, the object store, the scan process, and the records
database. D1 database `handoff` (`b2be192c-db0d-447f-8d7c-b2c4d39df274`,
region ENAM) is the system of record. D1 has no schemas and no row-level
security, so `src/db/records.ts` is the second isolation layer: a caller
sees a workspace only through a live super-admin row, a live operator row,
or a live membership. Routes still return 404 when that lookup misses.

| Plan piece | Vercel and Render | Cloudflare |
|---|---|---|
| Next.js app | Vercel | Workers through OpenNext (`@opennextjs/cloudflare`) |
| File bytes | Supabase Storage resumable uploads, 6 MiB parts | R2 multipart upload. Parts stay 6 MiB, above R2's 5 MiB minimum. The browser still does not post file bodies to the app server |
| Private downloads | Supabase signed URLs, same TTLs | R2 presigned GET URLs, same TTLs: 5 minutes, 60 minutes, 24 hours |
| Scanner | Render service with `clamd` beside the worker | Cloudflare Container from `worker/Dockerfile`. A Worker cannot run `clamd` inside the isolate |
| Sweeps, mail, purge | Render process loop | Queues for scan and mail, Cron Triggers for sweeps and purge |
| Records and sessions | Supabase Postgres and Auth | D1. Magic links are sent by Resend. Session rows live in D1 |
| One region (HND-056) | One Postgres region | D1 region ENAM, with the R2 location and the Container region pinned to it |

Upload routes stay route handlers. Do not accept file bytes through a Server
Action: Cloudflare's WAF can block a `Next-Action` multipart body before the
Worker runs.

R2 has no `storage.objects` policies. The authorization function still runs
before any R2 call. `objectWriteAllowed` allows a write only for a live
client membership, an active batch, and a file in `pending`, `uploading`, or
`failed` whose object key is exactly `{workspaceId}/{batchId}/{fileId}`.
Staff cannot write objects. Isolation tests run the same SQL file on Node's
built-in SQLite.

`tus-js-client` is not the R2 client. The drop screen uses the R2 multipart
API (create, upload part, complete) with the same retry rule: only a failed
part is sent again.

Local development uses `wrangler dev` for the Worker and D1, or
`.data/handoff.db` when the Worker context is absent. `npm test` applies
`migrations/0001_handoff.sql` in memory. Production fails closed when
`RESEND_API_KEY` is missing. The D1 binding is Wrangler configuration, not an
environment secret. Containers, R2, and Queues need a Workers plan that
includes them. R2 must be enabled in the Cloudflare dashboard before buckets
can be created.

Cursor talks to the Cloudflare API through `.cursor/mcp.json`. That file
points at `https://mcp.cloudflare.com/mcp` and sends
`Authorization: Bearer ${env:CLOUDFLARE_API_TOKEN}`. The token itself stays
in the environment or a gitignored `.dev.vars`. Do not commit it. The same
file is where local R2 S3 credentials live (`R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`). Wrangler still uses the bucket
bindings, not those S3 keys, for the Worker.

Before adding App Router pages, route handlers, or server actions, read the
current guide in that project's `node_modules/next/dist/docs/`.

## Global constraints

- One deployment serves many clients in one data region.
- Isolation is enforced in the authorization function and again by record
  queries scoped to the caller. A task that adds a table adds that scope and
  a database isolation test in the same commit.
- A route returns 404 for a workspace the caller cannot see.
- Uploads use R2 multipart uploads, 6 MiB chunks, concurrency 3.
- The Next.js server accepts manifests and issues decisions. It does not
  accept file bodies.
- Object keys are `{workspaceId}/{batchId}/{fileId}`.
- Only the worker moves a file out of `uploaded`. Production requires `clamd`.
- `HANDOFF_ALLOW_UNSCANNED=1` is refused when `NODE_ENV=production`.
- Download URLs last 5 minutes. Export URLs last 60 minutes, or 24 hours for a
  workspace export. All are attachments, only for `clean` files.
- Tags never trigger an import, publish, or scan.
- Unit tests use fakes and open no network connection. Database tests run
  the D1 migration on Node's built-in SQLite with `npm test` and
  `npm run test:db`.
- Production fails closed when `RESEND_API_KEY` is missing. The D1 database
  is the `DB` binding in `wrangler.jsonc`.
- No `NEXT_PUBLIC_` variable contains a secret.
- Logs, email, and audit metadata exclude tokens, signed URLs, and bytes.
- No product copy names a specific client except through workspace data.
- Use one logical commit per task.
- If this repository deploys to the same Vercel Hobby team as the operations
  app, commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>`
  using per-command author environment variables. Do not change git config.

## Environment contract

```text
RESEND_API_KEY
HANDOFF_FROM_EMAIL
HANDOFF_BUCKET=handoff
HANDOFF_BRANDING_BUCKET=branding
HANDOFF_SUPER_ADMIN_EMAILS
HANDOFF_REGION
CLAMD_HOST=127.0.0.1
CLAMD_PORT=3310
HANDOFF_ALLOW_UNSCANNED
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ENDPOINT
```

## File structure

| Path | Responsibility |
|---|---|
| `src/lib/policy/profiles.ts` | `standard` and `software` profiles, always-refused names |
| `src/lib/policy/paths.ts` | Relative path normalization |
| `src/lib/policy/limits.ts` | File, batch, quota, window, and rate limits |
| `src/lib/authz.ts` | Pure permission matrix (HND-006) |
| `src/lib/batches.ts` | Manifest validation, batch window, derived status |
| `src/lib/scan.ts` | Signature table and scan outcome decision |
| `src/lib/export.ts` | Export document builder |
| `src/lib/notifications.ts` | Event-to-recipient rules and idempotency keys |
| `src/lib/retention.ts` | Archive, purge-after, and reminder dates |
| `src/db/schema.ts` | Drizzle tables for D1 |
| `migrations/` | D1 SQL migrations |
| `src/db/records.ts` | Workspace-scoped reads and object-write checks |
| `wrangler.jsonc` | Worker name and the `DB` binding |
| `src/lib/session.ts` | Resolve caller and memberships from a D1 session |
| `src/lib/store/*.ts` | Persistence used by routes and the worker |
| `src/app/api/**` | Route handlers listed in the spec |
| `src/app/**/page.tsx` | Screens listed in the spec |
| `src/components/drop-zone.tsx` | Folder selection and resumable upload |
| `worker/Dockerfile` | `clamd`, `freshclam`, and the worker process |
| `worker/clamd.conf` | Stream, file, scan, and archive limits |
| `src/worker/index.ts` | Job loop and health check |
| `src/worker/jobs/*.ts` | Scan, window sweep, notifications, retention, purge |
| `cli/pull.ts` | `handoff pull <export.json> <dir>` |
| `src/db/isolation.test.ts` | Isolation tests on Node's built-in SQLite |

---

## Phase 1 — Pure policy

### Task 1: Scaffold the repository

**Files:**
- Create: Next.js app, Vitest, TypeScript, Tailwind, Zod, Drizzle, Supabase
  clients
- Create: `supabase/config.toml` for the local stack
- Create: `.env.example` with the environment contract
- Create: `README.md` with local setup, the one-region rule, and the statement
  that Handoff is not part of any client's product

- [x] **Step 1: Create the app and scripts**

Add `test`, `test:db`, `build`, `worker`, and `pull` scripts. `test` excludes
`tests/db`.

- [x] **Step 2: Confirm the empty suites and build run**

```bash
npm test
npm run build
npx supabase start
npm run test:db
```

- [x] **Step 3: Commit**

```bash
git commit -m "Scaffold the Handoff app."
```

### Task 2: File policy profiles

**Files:**
- Create: `src/lib/policy/profiles.ts`, `src/lib/policy/paths.ts`,
  `src/lib/policy/limits.ts`
- Test: matching `*.test.ts`

**Produces:**

```ts
export type PolicyProfile = "standard" | "software";

export function normalizeRelativePath(
  input: string,
): { ok: true; path: string } | { ok: false; reason: string };

export function inspectFileName(
  path: string,
  profile: PolicyProfile,
): { ok: true; extension: string } | { ok: false; reason: string };
```

- [x] **Step 1: Write failing tests**

- `Brand/logos/primary.svg` is allowed under both profiles
- `src/app.ts` is refused under `standard` and allowed under `software`
- `.env`, `.env.production`, `id_ed25519`, `server.pem` are refused under both
- `report.pdf.exe` and `setup.exe.pdf` are refused
- `/etc/passwd`, `a\b.pdf`, `a/../b.pdf`, `a/./b.pdf`, `a//b.pdf`,
  `.github/x.yml`, and a control character are refused
- two paths differing only by Unicode composition normalize equal
- `photo.JPG` reports `jpg`
- a path of 17 segments and a segment of 256 characters are refused

- [x] **Step 2: Run, implement, re-run, and commit**

```bash
npx vitest run src/lib/policy
git commit -m "Define handoff file policy profiles."
```

### Task 3: Authorization matrix

**Files:**
- Create: `src/lib/authz.ts`
- Test: `src/lib/authz.test.ts`

**Produces:**

```ts
export type Caller = {
  userId: string | null;
  staff: { superAdmin: boolean } | null;
  operatorOf: string[];
  memberships: { workspaceId: string; role: "client_owner" | "client_member" }[];
};

export type Action =
  | "workspace.view" | "workspace.create" | "workspace.configure"
  | "workspace.archive" | "workspace.export" | "workspace.purge"
  | "invite.owner" | "invite.member" | "member.remove"
  | "request.manage" | "batch.create" | "batch.discard" | "batch.delete"
  | "batch.export" | "file.download" | "file.tag" | "file.release";

export function can(
  caller: Caller,
  action: Action,
  target: { workspaceId?: string; batchCreatedBy?: string },
): boolean;
```

- [x] **Step 1: Write a table-driven failing test from HND-006**

Every row and column of the matrix is one case. Add cases for an unassigned
operator, a revoked membership, a client of workspace A acting on B, and a
client discarding someone else's batch.

- [x] **Step 2: Implement, test, and commit**

```bash
npx vitest run src/lib/authz.test.ts
git commit -m "Authorize handoff actions per workspace role."
```

### Task 4: Manifest, quota, window, and status

**Files:**
- Create: `src/lib/batches.ts`
- Test: `src/lib/batches.test.ts`

**Produces:**

```ts
export function validateManifest(input: {
  files: { relativePath: string; sizeBytes: number; contentType: string; tag?: string }[];
  profile: PolicyProfile;
  workspaceUsedBytes: number;
  workspaceQuotaBytes: number;
}): { ok: true; files: ValidFile[]; totalBytes: number } | { ok: false; reason: string; index?: number };

export function isBatchActive(createdAt: Date, lastActivityAt: Date, now: Date): boolean;

export function deriveBatchStatus(input: {
  files: { status: FileStatus }[];
  active: boolean;
  discarded: boolean;
}): BatchStatus;
```

- [x] **Step 1: Write failing tests**

- one bad entry refuses the manifest and returns its index
- duplicate normalized paths, an unknown tag, an empty file, 2,001 files, and
  10 GB plus one byte are refused
- a manifest that would exceed the workspace quota is refused
- a batch is active 5 hours after its last activity and inactive after 6
- a batch is inactive 24 hours after creation even with recent activity
- every row of the HND-048 status table

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Validate handoff manifests against quota and window."
```

### Task 5: Scan decision

**Files:**
- Create: `src/lib/scan.ts`
- Test: `src/lib/scan.test.ts`

**Produces:**

```ts
export function decideScan(input: {
  extension: string;
  header: Uint8Array;
  clamd:
    | { kind: "ok" }
    | { kind: "found"; signature: string }
    | { kind: "limit"; detail: string }
    | { kind: "error"; detail: string }
    | { kind: "skipped_dev" };
  attempts: number;
}):
  | { status: "clean" }
  | { status: "rejected"; reason: string }
  | { status: "held"; reason: string }
  | { status: "retry"; delaySeconds: number };
```

- [x] **Step 1: Write failing tests**

- a PDF starting with `%PDF` and `ok` is clean
- a `.png` whose header is not PNG is rejected
- a `.txt` starting with `MZ` is rejected
- `.dwg` with `ok` is clean on extension alone
- `found` is rejected with the signature name
- `limit` is held
- `error` on attempt 1 retries with backoff, and on attempt 5 is held
- `skipped_dev` is clean only when the caller passed the dev flag

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Decide handoff scan outcomes from signature and clamd."
```

---

## Phase 2 — Data, isolation, and identity

### Task 6: Schema and query scope

**Files:**
- Create: `src/db/schema.ts`
- Create: `migrations/0001_handoff.sql` for the HND-047 tables
- Create: `src/db/records.ts` for scoped reads and `objectWriteAllowed`
- Create: `wrangler.jsonc` binding `DB` to D1 database `handoff`

- [x] **Step 1: Add tables and constraints from HND-047**

Identifiers are text. Timestamps are unix milliseconds. Booleans are 0 or 1.
`size_bytes` and `quota_bytes` are integers. Add the unique constraints and
the `(workspace_id, sha256)` index. Partial unique indexes cover live
memberships, live invites, and live operator assignments.

- [x] **Step 2: Scope every read and the object write**

`workspacesFor` returns a workspace only when the caller's user id is a live
super-admin, a live operator, or a live member. `workspaceById` returns
nothing otherwise, so routes can answer 404. File, request, batch,
membership, and operator reads return an empty list for a hidden workspace.
`objectWriteAllowed` parses `{workspaceId}/{batchId}/{fileId}`, then requires
a live membership, an active batch, a writable file status, and an exact key
match. Staff cannot write objects. A signed-out caller sees nothing.

- [x] **Step 3: Bind D1**

`wrangler.jsonc` binds `DB` to database `handoff`. Apply the migration with
`npx wrangler d1 migrations apply handoff --remote`. The Worker reads that
binding from the OpenNext Cloudflare context. Local tests and `next dev`
outside a Worker use Node sqlite.

- [x] **Step 4: Commit**

```bash
git commit -m "Store handoff records in Cloudflare D1."
```

### Task 7: Isolation tests

**Files:**
- Create: `src/db/isolation.test.ts`

- [x] **Step 1: Seed two workspaces, two operators, and two clients**

Apply `migrations/0001_handoff.sql` to an in-memory sqlite database. Insert
both workspaces before calling the record functions.

- [x] **Step 2: Assert**

- raw SQL still returns workspace B, so the filter is in the query layer
- client A selects no rows from workspace B
- client A cannot write an object under workspace B's prefix, under their own
  prefix with a made-up file id, or over a clean file's key
- operator A sees no workspace B rows
- an expired batch, and a batch idle for exactly six hours, reject a write to
  a still-pending key
- a signed-out caller reads nothing
- a second live membership for the same user and workspace is rejected

- [x] **Step 3: Run and commit**

```bash
npm run test:db
git commit -m "Store handoff records in Cloudflare D1."
```

### Task 8: Sign-in, staff, and email

**Files:**
- Create: `src/lib/session.ts`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/lib/store/staff.ts`

- [x] **Step 1: Bootstrap super-admins**

When `staff` is empty, the first sign-in whose email is listed in
`HANDOFF_SUPER_ADMIN_EMAILS` creates a super-admin row with that user id.

- [x] **Step 2: Magic link through Resend**

Send the link with Resend and store the session in D1. The message uses
Handoff wording and no client name.

- [x] **Step 3: Resolve the caller**

`getCaller()` returns the `Caller` shape from Task 3 in one D1 query. A
revoked row is not returned.

- [x] **Step 4: Commit**

```bash
git commit -m "Sign in to Handoff with branded magic links."
```

### Task 9: Workspaces, operators, and branding

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/workspaces/new/page.tsx`
- Create: `src/app/admin/staff/page.tsx`
- Create: `src/app/w/[slug]/settings/page.tsx`
- Create: `src/lib/store/workspaces.ts`
- Test: action tests with a fake store

- [x] **Step 1: Write failing action tests**

- only a super-admin creates a workspace, assigns operators, or changes
  profile and quota
- creating from a template copies its items into `requests`
- a logo that is not PNG or WebP, or over 512 KB, is refused
- an accepted logo is re-encoded before it is stored in `branding`

- [x] **Step 2: Implement**

The workspace layout reads `display_name` and the logo for every screen.

- [x] **Step 3: Commit**

```bash
git commit -m "Create branded handoff workspaces and assign operators."
```

### Task 10: Invites and memberships

**Files:**
- Create: `src/app/w/[slug]/people/page.tsx`
- Create: `src/app/invites/[inviteId]/page.tsx`
- Create: `src/lib/store/invites.ts`
- Test: action tests

- [x] **Step 1: Write failing tests**

- a client owner can invite a member and cannot invite an owner
- an operator can invite either role
- acceptance by a user whose verified email differs creates nothing
- acceptance of an expired, revoked, or archived-workspace invite creates
  nothing
- acceptance creates a membership keyed by user id
- a second live invite for the same email and workspace is refused
- the 31st invite by one inviter in a day is refused

- [x] **Step 2: Implement**

Send the invite as a magic link that returns to `/invites/[inviteId]`.

- [x] **Step 3: Commit**

```bash
git commit -m "Invite client owners and members into a handoff workspace."
```

### Task 11: Requests and templates

**Files:**
- Create: `src/app/admin/templates/page.tsx`
- Create: `src/app/w/[slug]/requests/page.tsx`
- Create: `src/lib/store/requests.ts`
- Test: action tests

- [x] **Step 1: Write failing tests**

- staff create, reorder, and retire template items
- editing a template does not change requests already copied
- only staff create, edit, close, or reopen requests

- [x] **Step 2: Implement**

The workspace home lists open requests first. Each request has a button to
start a drop against it.

- [x] **Step 3: Commit**

```bash
git commit -m "Track what each client still needs to send."
```

---

## Phase 3 — Upload

### Task 12: Create a batch

**Files:**
- Create: `src/app/api/workspaces/[slug]/batches/route.ts`
- Test: route tests with a fake store

- [x] **Step 1: Write failing tests**

- a client's valid manifest writes `pending` rows and returns object keys
- a staff caller cannot create a batch
- a caller outside the workspace receives 404 and nothing is written
- a blocked file, an over-quota manifest, or an archived workspace refuses
- a `request_id` from another workspace or a closed request refuses
- the 11th batch in an hour receives 429

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Create a handoff batch from a validated manifest."
```

### Task 13: Activity, grants, and completion

**Files:**
- Create: `src/app/api/batches/[batchId]/files/[fileId]/grant/route.ts`
- Create: `src/app/api/batches/[batchId]/files/[fileId]/complete/route.ts`
- Test: route tests

- [x] **Step 1: Write failing tests**

- a grant for a `pending` or `failed` file in an active batch succeeds and
  updates `last_activity_at`
- a grant for a `clean`, `held`, `rejected`, or `uploaded` file fails
- a grant on an inactive batch fails
- completion with a matching stored size marks `uploaded` and enqueues once
- a repeat completion returns the same row and enqueues nothing
- a size mismatch marks `failed` and deletes the object

- [x] **Step 2: Implement, test, and commit**

Completion reads object metadata only.

```bash
git commit -m "Grant and complete direct handoff uploads."
```

### Task 14: Drop screen

**Files:**
- Create: `src/components/drop-zone.tsx`
- Create: `src/app/w/[slug]/drop/page.tsx`
- Test: manifest builder tests

- [x] **Step 1: Build the manifest**

Read `webkitRelativePath` for a folder and `name` for loose files. Accept a
`request` search parameter and show that request's guidance.

- [x] **Step 2: Upload**

The Cloudflare path does not use `tus-js-client`. The drop screen posts the
manifest, then for each file calls grant, `POST .../multipart` (`create` /
`finish`), and `PUT /api/objects/parts` in 6 MiB parts with concurrency 3.
Local bytes use `HANDOFF_OBJECT_PATH` until an R2 bucket exists. Completion
runs after each success.

- [x] **Step 3: Progress and recovery**

Show the tree, per-file state, and totals. Register `beforeunload` while in
flight. Retry failed files while the batch is active. On a device without a
directory picker, keep multi-file selection and show the computer-folder
instruction. Show the HND-058 notice.

- [x] **Step 4: Commit**

```bash
git commit -m "Upload a folder into a handoff workspace."
```

---

## Phase 4 — Worker

### Task 15: Worker image and scan job

**Files:**
- Create: `worker/Dockerfile`, `worker/clamd.conf`, `worker/start.sh`
- Create: `src/worker/index.ts`, `src/worker/jobs/scan.ts`
- Create: `src/worker/clamd.ts`
- Test: scan job tests with a fake object stream and fake `clamd`

- [x] **Step 1: Build the image**

Install ClamAV. `start.sh` runs `freshclam` once, starts `clamd`, schedules
`freshclam` every 4 hours, then starts the worker. Set `StreamMaxLength`,
`MaxFileSize`, and `MaxScanSize` to at least 2 GB. Enable archive scanning
with `MaxRecursion`, `MaxFiles`, and `MaxScanSize` limits, and alert on
exceeded limits so they come back as `limit`.

- [x] **Step 2: Write failing job tests**

- a claimed file is marked `scanning` and read once
- the one read yields the SHA-256, the header, and the `clamd` stream
- each `decideScan` outcome writes the matching status, reason, and audit
- `retry` returns the file to `uploaded` with `next_scan_at`
- two workers never scan the same file
- startup in production with no reachable `clamd` exits non-zero
- `HANDOFF_ALLOW_UNSCANNED=1` with `NODE_ENV=production` exits non-zero

- [x] **Step 3: Implement the loop**

Claim with `BEGIN IMMEDIATE` and a compare-and-set from `uploaded` to
`scanning`. D1 cannot use `FOR UPDATE SKIP LOCKED`. Expose `/health` on
`$PORT`, bound to `0.0.0.0`, that reports `clamd` reachability.

- [x] **Step 4: Commit**

```bash
git commit -m "Scan handoff objects with clamd in one pass."
```

### Task 16: Request receipt and notifications

**Files:**
- Create: `src/lib/notifications.ts`
- Create: `src/worker/jobs/notify.ts`
- Create: email templates
- Test: rule and job tests with a fake Resend client

- [x] **Step 1: Write failing tests**

- the first clean file in a batch that names a request marks it `received`
- each HND-045 event produces its recipients and one idempotency key
- a repeated event sends nothing new
- email bodies contain no URL other than a Handoff page link
- the weekly digest goes only to owners of workspaces that enabled it

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Email operators and clients about handoff progress."
```

### Task 17: Sweeps

**Files:**
- Create: `src/worker/jobs/sweep-windows.ts`
- Create: `src/worker/jobs/delete-rejected.ts`
- Test: job tests

- [x] **Step 1: Write failing tests**

- files still `pending` or `uploading` in an inactive batch become `failed`
  and queue the uploader email
- rejected and failed objects older than 14 days are deleted and the row
  records `object_deleted_at`

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Close idle handoff batches and delete rejected objects."
```

---

## Phase 5 — Review and pull

### Task 18: Batch screen and download

**Files:**
- Create: `src/app/w/[slug]/batches/[batchId]/page.tsx`
- Create: `src/app/api/batches/[batchId]/files/[fileId]/download/route.ts`
- Create: `src/app/api/batches/[batchId]/discard/route.ts`
- Test: route tests

- [x] **Step 1: Write failing tests**

- a clean file returns a 5-minute attachment URL and writes `file.downloaded`
- a held, scanning, or rejected file returns 409
- a caller outside the workspace receives 404
- a client discards their own batch only while no file is clean
- a file whose hash matches an earlier clean file in the workspace is marked

- [x] **Step 2: Implement, test, and commit**

Operators can change tags from this screen.

```bash
git commit -m "Review and download clean handoff files."
```

### Task 19: Export and `handoff pull`

**Files:**
- Create: `src/lib/export.ts`
- Create: `src/app/api/batches/[batchId]/export/route.ts`
- Create: `cli/pull.ts`
- Test: export builder and CLI tests against a temp directory

- [x] **Step 1: Write failing tests**

- export lists clean files with 60-minute URLs and other files without URLs
- a client cannot export, and the 21st export in an hour is refused
- `pull` recreates the tree, verifies each hash, and skips matching files
- `pull` refuses a path that resolves outside the target directory
- `pull` deletes a partial file whose hash does not match and exits non-zero

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Pull a whole handoff batch with verified hashes."
```

### Task 20: Held review

**Files:**
- Create: `src/app/admin/held/page.tsx`
- Test: action tests

- [x] **Step 1: Write failing tests**

- only a super-admin can release or reject a held file
- release and reject both require a reason and write an audit event
- release queues the uploader email and can complete a request

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Let a super-admin release or reject held files."
```

---

## Phase 6 — Engagement end

### Task 21: Archive, workspace export, and purge

**Files:**
- Create: `src/lib/retention.ts`
- Create: `src/worker/jobs/purge.ts`
- Modify: `src/app/w/[slug]/settings/page.tsx`
- Test: retention and purge tests

- [x] **Step 1: Write failing tests**

- archive sets `purge_after` to archive date plus `retention_days`
- archive refuses new batches, invites, and requests and keeps downloads
- archive queues the owner and operator email, and a reminder 7 days before
  purge
- a workspace export covers every batch with 24-hour URLs
- purge refuses an `active` workspace
- purge deletes every object and every file, batch, request, invite, and
  membership row, and records counts and bytes
- audit rows survive purge
- early purge requires a super-admin and a reason

- [x] **Step 2: Implement, test, and commit**

```bash
git commit -m "Archive, export, and purge a finished handoff workspace."
```

---

## Phase 7 — Deploy and accept

### Task 22: Provision and deploy

- [x] **Step 1: Cloudflare Worker**

Deploy the Next.js app with OpenNext (`npx opennextjs-cloudflare build`, then
`npx opennextjs-cloudflare deploy`). Worker name `handoff`. `main` is
`.open-next/worker.js`. D1 database `handoff`
(`b2be192c-db0d-447f-8d7c-b2c4d39df274`) is bound as `DB`. Assets bind as
`ASSETS`. The service binding is `WORKER_SELF_REFERENCE`. `workers_dev` is
on. Public URL: https://handoff.abracadabra-ai.workers.dev. Do not attach
`abra-ca-dabra.app`.

- [x] **Step 2: Worker secrets**

Set `HANDOFF_SIGNING_SECRET` and `HANDOFF_APP_ORIGIN`
(`https://handoff.abracadabra-ai.workers.dev`). Do not set `RESEND_API_KEY`,
`HANDOFF_FROM_EMAIL`, or `HANDOFF_OBJECT_PATH`. Magic links fail closed.
Uploads, scan object reads, and object purge return 503 until object storage
exists.

- [x] **Step 3: R2**

R2 is not enabled on this account (API error 10042). Do not add an R2
binding. The OpenNext incremental cache stays the dummy cache from
`defineCloudflareConfig()`.

- [x] **Step 4: Scan container**

`worker/Dockerfile` is not deployed. A Worker isolate cannot run `clamd`.
Do not claim EICAR or archive-limit acceptance on this Worker.

- [x] **Step 5: Record the deployment in `README.md` and commit**

```bash
git commit -m "Document the Handoff deployment."
```

### Task 23: Acceptance

- [x] **Step 1: Run the suites**

`npm test` passed 87 files and 453 tests. `npm run test:db` passed 3 files
and 9 tests. `npm run build` succeeded.

- [x] **Step 2: Walk the acceptance list this deployment can run**

`GET /api/health` and the sign-in page on
https://handoff.abracadabra-ai.workers.dev returned 200. The suites cover
workspace isolation, blocked names (`.env`, `report.pdf.exe`, `..`), an
over-quota manifest, `handoff pull` hash checks, held-file release, and
archive and purge behavior.

Not run on the Worker: a file over 1 GB, the EICAR test file, and a file
that trips a `clamd` archive limit. R2 is not enabled, and
`worker/Dockerfile` is not deployed. Those items are not accepted.

- [x] **Step 3: Confirm the boundary**

This work does not change a Strong Foam operations application. Handoff does
not share its package, cookie, or database with that site.

- [x] **Step 4: Commit any staging fix**

```bash
git commit -m "Fix handoff issues found in staging acceptance."
```

Skipped. The suites and the live health check found no defect to fix.

## Done when

Every acceptance item in the design spec passes on staging with two client
workspaces, and the Strong Foam operations application is unchanged.

The suites, production build, Worker health check, and sign-in page pass.
Still open until R2, Resend, and the ClamAV container exist: a file over
1 GB, EICAR, a `clamd` archive limit, and a live client invite.
