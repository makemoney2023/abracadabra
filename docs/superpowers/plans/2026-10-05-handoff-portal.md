# Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-client locker where each client's invited people drop
folders of brand, photo, copy, export, source, and reference files against a
request checklist, and the operators assigned to that client pull the files
that pass a malware scan.

**Architecture:** A standalone Next.js app on Vercel authenticates with its
own Supabase Auth magic links, sent through Resend SMTP. Server routes call
one pure authorization function, then write with the server key. Row-level
security on every table and on `storage.objects` isolates workspaces a second
time. The browser uploads bytes with the Storage resumable protocol into a
private bucket. One Render background worker runs `clamd` beside the Handoff
worker process. It is the only code that marks a file clean. The same worker
also sends notifications and runs sweeps and purges. Operators pull batches
with an export file and a `handoff pull` command. The Strong Foam operations
platform is not imported, linked, or migrated.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Zod, Drizzle
ORM, Supabase Postgres, Supabase Auth, Supabase Storage resumable uploads,
`tus-js-client`, Resend, ClamAV `clamd`, Render background worker, Docker,
Tailwind CSS.

**Design:** `docs/superpowers/specs/2026-10-05-handoff-portal-design.md`
in the operations repository. Requirements HND-001 through HND-058.

---

## Repository boundary

Implement this plan in a new private repository,
`https://github.com/makemoney2023/clienthandoff`. Do not add application code,
dependencies, environment variables, or migrations to the operations
repository. The operations repository keeps the spec and this plan only.

The new app does not depend on the operations package, does not read any
operations cookie, and does not connect to the operations database.

Before adding App Router pages, route handlers, or server actions, read the
current guide in that project's `node_modules/next/dist/docs/`.

## Global constraints

- One deployment serves many clients in one data region.
- Isolation is enforced in the authorization function and again by RLS and
  storage policies. A task that adds a table adds its policy and a database
  isolation test in the same commit.
- A route returns 404 for a workspace the caller cannot see.
- Uploads use Storage resumable uploads, 6 MiB chunks, concurrency 3.
- The Next.js server accepts manifests and issues decisions. It does not
  accept file bodies.
- Object keys are `{workspaceId}/{batchId}/{fileId}`.
- Only the worker moves a file out of `uploaded`. Production requires `clamd`.
- `HANDOFF_ALLOW_UNSCANNED=1` is refused when `NODE_ENV=production`.
- Download URLs last 5 minutes. Export URLs last 60 minutes, or 24 hours for a
  workspace export. All are attachments, only for `clean` files.
- Tags never trigger an import, publish, or scan.
- Unit tests use fakes and open no network connection. Database tests run
  against a local Supabase stack with `npm run test:db`.
- Production fails closed when `SUPABASE_SECRET_KEY`, `DATABASE_URL`, or
  `RESEND_API_KEY` is missing.
- No `NEXT_PUBLIC_` variable contains a secret.
- Logs, email, and audit metadata exclude tokens, signed URLs, and bytes.
- No product copy names a specific client except through workspace data.
- Use one logical commit per task.
- If this repository deploys to the same Vercel Hobby team as the operations
  app, commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>`
  using per-command author environment variables. Do not change git config.

## Environment contract

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
DATABASE_URL
DIRECT_URL
RESEND_API_KEY
HANDOFF_FROM_EMAIL
HANDOFF_BUCKET=handoff
HANDOFF_BRANDING_BUCKET=branding
HANDOFF_SUPER_ADMIN_EMAILS
HANDOFF_REGION
CLAMD_HOST=127.0.0.1
CLAMD_PORT=3310
HANDOFF_ALLOW_UNSCANNED
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
| `src/db/schema.ts` | Drizzle tables |
| `drizzle/` | SQL migrations, including RLS and storage policies |
| `supabase/` | Local stack config, auth email templates |
| `src/lib/session.ts` | Resolve caller and memberships from Supabase Auth |
| `src/lib/store/*.ts` | Persistence used by routes and the worker |
| `src/app/api/**` | Route handlers listed in the spec |
| `src/app/**/page.tsx` | Screens listed in the spec |
| `src/components/drop-zone.tsx` | Folder selection and resumable upload |
| `worker/Dockerfile` | `clamd`, `freshclam`, and the worker process |
| `worker/clamd.conf` | Stream, file, scan, and archive limits |
| `src/worker/index.ts` | Job loop and health check |
| `src/worker/jobs/*.ts` | Scan, window sweep, notifications, retention, purge |
| `cli/pull.ts` | `handoff pull <export.json> <dir>` |
| `tests/db/*.test.ts` | Isolation tests against local Supabase |

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

- [ ] **Step 1: Create the app and scripts**

Add `test`, `test:db`, `build`, `worker`, and `pull` scripts. `test` excludes
`tests/db`.

- [ ] **Step 2: Confirm the empty suites and build run**

```bash
npm test
npm run build
npx supabase start
npm run test:db
```

- [ ] **Step 3: Commit**

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

- [ ] **Step 1: Write failing tests**

- `Brand/logos/primary.svg` is allowed under both profiles
- `src/app.ts` is refused under `standard` and allowed under `software`
- `.env`, `.env.production`, `id_ed25519`, `server.pem` are refused under both
- `report.pdf.exe` and `setup.exe.pdf` are refused
- `/etc/passwd`, `a\b.pdf`, `a/../b.pdf`, `a/./b.pdf`, `a//b.pdf`,
  `.github/x.yml`, and a control character are refused
- two paths differing only by Unicode composition normalize equal
- `photo.JPG` reports `jpg`
- a path of 17 segments and a segment of 256 characters are refused

- [ ] **Step 2: Run, implement, re-run, and commit**

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

- [ ] **Step 1: Write a table-driven failing test from HND-006**

Every row and column of the matrix is one case. Add cases for an unassigned
operator, a revoked membership, a client of workspace A acting on B, and a
client discarding someone else's batch.

- [ ] **Step 2: Implement, test, and commit**

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

- [ ] **Step 1: Write failing tests**

- one bad entry refuses the manifest and returns its index
- duplicate normalized paths, an unknown tag, an empty file, 2,001 files, and
  10 GB plus one byte are refused
- a manifest that would exceed the workspace quota is refused
- a batch is active 5 hours after its last activity and inactive after 6
- a batch is inactive 24 hours after creation even with recent activity
- every row of the HND-048 status table

- [ ] **Step 2: Implement, test, and commit**

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

- [ ] **Step 1: Write failing tests**

- a PDF starting with `%PDF` and `ok` is clean
- a `.png` whose header is not PNG is rejected
- a `.txt` starting with `MZ` is rejected
- `.dwg` with `ok` is clean on extension alone
- `found` is rejected with the signature name
- `limit` is held
- `error` on attempt 1 retries with backoff, and on attempt 5 is held
- `skipped_dev` is clean only when the caller passed the dev flag

- [ ] **Step 2: Implement, test, and commit**

```bash
git commit -m "Decide handoff scan outcomes from signature and clamd."
```

---

## Phase 2 — Data, isolation, and identity

### Task 6: Schema and policies

**Files:**
- Create: `src/db/schema.ts`
- Create: migrations for the HND-047 tables
- Create: a migration for RLS, storage policies, and helper functions

- [ ] **Step 1: Add tables and constraints from HND-047**

`size_bytes` and `quota_bytes` are `bigint`. Add the unique constraints and
the `(workspace_id, sha256)` index.

- [ ] **Step 2: Add policy helpers**

Security-definer functions, `search_path` pinned:
`handoff.is_member(workspace_id)`, `handoff.is_operator(workspace_id)`,
`handoff.is_super_admin()`, `handoff.can_write_object(name)`. The last parses
`{workspaceId}/{batchId}/{fileId}`, then requires a live membership, an active
batch, a writable file status, and an exact key match.

- [ ] **Step 3: Enable RLS everywhere**

Authenticated users may `select` workspaces, requests, batches, and files only
where a helper allows it. They have no direct `insert`, `update`, or `delete`
on any table. `staff`, `invites`, `notifications`, and `audit_events` have no
authenticated access. On `storage.objects`, `insert` and `update` in bucket
`handoff` require `can_write_object(name)`. There is no client `select` on
the `handoff` bucket.

- [ ] **Step 4: Commit**

```bash
git commit -m "Add handoff tables with workspace row and storage policies."
```

### Task 7: Isolation tests

**Files:**
- Create: `tests/db/isolation.test.ts`
- Create: `tests/db/fixtures.ts`

- [ ] **Step 1: Seed two workspaces, two operators, and two clients**

Sign each fixture user in against the local stack and use their own session.

- [ ] **Step 2: Assert**

- client A selects no rows from workspace B in every table
- client A cannot write an object under workspace B's prefix, under their own
  prefix with a made-up file id, or over a clean file's key
- operator A sees no workspace B rows
- an expired batch rejects a write to a still-pending key
- the publishable key alone reads nothing

- [ ] **Step 3: Run and commit**

```bash
npm run test:db
git commit -m "Prove handoff workspaces are isolated in the database."
```

### Task 8: Sign-in, staff, and email

**Files:**
- Create: `src/lib/session.ts`
- Create: `src/app/page.tsx`, `src/app/auth/callback/route.ts`
- Create: `supabase/templates/magic-link.html`
- Create: `src/lib/store/staff.ts`

- [ ] **Step 1: Bootstrap super-admins**

When `staff` is empty, the first sign-in whose email is listed in
`HANDOFF_SUPER_ADMIN_EMAILS` creates a super-admin row with that user id.

- [ ] **Step 2: Magic link through Resend SMTP**

Configure custom SMTP in `supabase/config.toml` for local work. Record the
production setting in the README. The template uses Handoff wording and no
client name.

- [ ] **Step 3: Resolve the caller**

`getCaller()` returns the `Caller` shape from Task 3 in one query. A revoked
row is not returned.

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Write failing action tests**

- only a super-admin creates a workspace, assigns operators, or changes
  profile and quota
- creating from a template copies its items into `requests`
- a logo that is not PNG or WebP, or over 512 KB, is refused
- an accepted logo is re-encoded before it is stored in `branding`

- [ ] **Step 2: Implement**

The workspace layout reads `display_name` and the logo for every screen.

- [ ] **Step 3: Commit**

```bash
git commit -m "Create branded handoff workspaces and assign operators."
```

### Task 10: Invites and memberships

**Files:**
- Create: `src/app/w/[slug]/people/page.tsx`
- Create: `src/app/invites/[inviteId]/page.tsx`
- Create: `src/lib/store/invites.ts`
- Test: action tests

- [ ] **Step 1: Write failing tests**

- a client owner can invite a member and cannot invite an owner
- an operator can invite either role
- acceptance by a user whose verified email differs creates nothing
- acceptance of an expired, revoked, or archived-workspace invite creates
  nothing
- acceptance creates a membership keyed by user id
- a second live invite for the same email and workspace is refused
- the 31st invite by one inviter in a day is refused

- [ ] **Step 2: Implement**

Send the invite as a magic link that returns to `/invites/[inviteId]`.

- [ ] **Step 3: Commit**

```bash
git commit -m "Invite client owners and members into a handoff workspace."
```

### Task 11: Requests and templates

**Files:**
- Create: `src/app/admin/templates/page.tsx`
- Create: `src/app/w/[slug]/requests/page.tsx`
- Create: `src/lib/store/requests.ts`
- Test: action tests

- [ ] **Step 1: Write failing tests**

- staff create, reorder, and retire template items
- editing a template does not change requests already copied
- only staff create, edit, close, or reopen requests

- [ ] **Step 2: Implement**

The workspace home lists open requests first. Each request has a button to
start a drop against it.

- [ ] **Step 3: Commit**

```bash
git commit -m "Track what each client still needs to send."
```

---

## Phase 3 — Upload

### Task 12: Create a batch

**Files:**
- Create: `src/app/api/workspaces/[slug]/batches/route.ts`
- Test: route tests with a fake store

- [ ] **Step 1: Write failing tests**

- a client's valid manifest writes `pending` rows and returns object keys
- a staff caller cannot create a batch
- a caller outside the workspace receives 404 and nothing is written
- a blocked file, an over-quota manifest, or an archived workspace refuses
- a `request_id` from another workspace or a closed request refuses
- the 11th batch in an hour receives 429

- [ ] **Step 2: Implement, test, and commit**

```bash
git commit -m "Create a handoff batch from a validated manifest."
```

### Task 13: Activity, grants, and completion

**Files:**
- Create: `src/app/api/batches/[batchId]/files/[fileId]/grant/route.ts`
- Create: `src/app/api/batches/[batchId]/files/[fileId]/complete/route.ts`
- Test: route tests

- [ ] **Step 1: Write failing tests**

- a grant for a `pending` or `failed` file in an active batch succeeds and
  updates `last_activity_at`
- a grant for a `clean`, `held`, `rejected`, or `uploaded` file fails
- a grant on an inactive batch fails
- completion with a matching stored size marks `uploaded` and enqueues once
- a repeat completion returns the same row and enqueues nothing
- a size mismatch marks `failed` and deletes the object

- [ ] **Step 2: Implement, test, and commit**

Completion reads object metadata only.

```bash
git commit -m "Grant and complete direct handoff uploads."
```

### Task 14: Drop screen

**Files:**
- Create: `src/components/drop-zone.tsx`
- Create: `src/app/w/[slug]/drop/page.tsx`
- Test: manifest builder tests

- [ ] **Step 1: Build the manifest**

Read `webkitRelativePath` for a folder and `name` for loose files. Accept a
`request` search parameter and show that request's guidance.

- [ ] **Step 2: Upload**

Use `tus-js-client` against the Storage resumable endpoint with the user's
access token, 6 MiB chunks, concurrency 3. Refresh the grant before each file
and on resume. Call completion after each success.

- [ ] **Step 3: Progress and recovery**

Show the tree, per-file state, and totals. Register `beforeunload` while in
flight. Retry failed files while the batch is active. On a device without a
directory picker, keep multi-file selection and show the computer-folder
instruction. Show the HND-058 notice.

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Build the image**

Install ClamAV. `start.sh` runs `freshclam` once, starts `clamd`, schedules
`freshclam` every 4 hours, then starts the worker. Set `StreamMaxLength`,
`MaxFileSize`, and `MaxScanSize` to at least 2 GB. Enable archive scanning
with `MaxRecursion`, `MaxFiles`, and `MaxScanSize` limits, and alert on
exceeded limits so they come back as `limit`.

- [ ] **Step 2: Write failing job tests**

- a claimed file is marked `scanning` and read once
- the one read yields the SHA-256, the header, and the `clamd` stream
- each `decideScan` outcome writes the matching status, reason, and audit
- `retry` returns the file to `uploaded` with `next_scan_at`
- two workers never scan the same file
- startup in production with no reachable `clamd` exits non-zero
- `HANDOFF_ALLOW_UNSCANNED=1` with `NODE_ENV=production` exits non-zero

- [ ] **Step 3: Implement the loop**

Claim with `FOR UPDATE SKIP LOCKED`. Expose `/health` on `$PORT`, bound to
`0.0.0.0`, that reports `clamd` reachability.

- [ ] **Step 4: Commit**

```bash
git commit -m "Scan handoff objects with clamd in one pass."
```

### Task 16: Request receipt and notifications

**Files:**
- Create: `src/lib/notifications.ts`
- Create: `src/worker/jobs/notify.ts`
- Create: email templates
- Test: rule and job tests with a fake Resend client

- [ ] **Step 1: Write failing tests**

- the first clean file in a batch that names a request marks it `received`
- each HND-045 event produces its recipients and one idempotency key
- a repeated event sends nothing new
- email bodies contain no URL other than a Handoff page link
- the weekly digest goes only to owners of workspaces that enabled it

- [ ] **Step 2: Implement, test, and commit**

```bash
git commit -m "Email operators and clients about handoff progress."
```

### Task 17: Sweeps

**Files:**
- Create: `src/worker/jobs/sweep-windows.ts`
- Create: `src/worker/jobs/delete-rejected.ts`
- Test: job tests

- [ ] **Step 1: Write failing tests**

- files still `pending` or `uploading` in an inactive batch become `failed`
  and queue the uploader email
- rejected and failed objects older than 14 days are deleted and the row
  records `object_deleted_at`

- [ ] **Step 2: Implement, test, and commit**

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

- [ ] **Step 1: Write failing tests**

- a clean file returns a 5-minute attachment URL and writes `file.downloaded`
- a held, scanning, or rejected file returns 409
- a caller outside the workspace receives 404
- a client discards their own batch only while no file is clean
- a file whose hash matches an earlier clean file in the workspace is marked

- [ ] **Step 2: Implement, test, and commit**

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

- [ ] **Step 1: Write failing tests**

- export lists clean files with 60-minute URLs and other files without URLs
- a client cannot export, and the 21st export in an hour is refused
- `pull` recreates the tree, verifies each hash, and skips matching files
- `pull` refuses a path that resolves outside the target directory
- `pull` deletes a partial file whose hash does not match and exits non-zero

- [ ] **Step 2: Implement, test, and commit**

```bash
git commit -m "Pull a whole handoff batch with verified hashes."
```

### Task 20: Held review

**Files:**
- Create: `src/app/admin/held/page.tsx`
- Test: action tests

- [ ] **Step 1: Write failing tests**

- only a super-admin can release or reject a held file
- release and reject both require a reason and write an audit event
- release queues the uploader email and can complete a request

- [ ] **Step 2: Implement, test, and commit**

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

- [ ] **Step 1: Write failing tests**

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

- [ ] **Step 2: Implement, test, and commit**

```bash
git commit -m "Archive, export, and purge a finished handoff workspace."
```

---

## Phase 7 — Deploy and accept

### Task 22: Provision and deploy

- [ ] **Step 1: Supabase**

Create the Handoff project on a paid plan in the region recorded as
`HANDOFF_REGION`. Confirm it matches Strong Foam's operations region before
the first invite. Set the global file size limit and the `handoff` bucket
limit to at least 2 GB. Create the `branding` bucket. Configure Resend SMTP
and the auth email template. Set the site URL and redirect URLs to the
Handoff domain. Run migrations with `DIRECT_URL`.

- [ ] **Step 2: Resend**

Verify the sending domain and set `HANDOFF_FROM_EMAIL`.

- [ ] **Step 3: Vercel**

Create a separate Vercel project for this repository. Set the environment
contract. Attach the Handoff domain.

- [ ] **Step 4: Render**

Create a background worker from `worker/Dockerfile`. Size it for the ClamAV
signature database plus scanning headroom. Set the worker environment. Point
the health check at `/health`.

- [ ] **Step 5: Record the deployment in `README.md` and commit**

```bash
git commit -m "Document the Handoff deployment."
```

### Task 23: Acceptance

- [ ] **Step 1: Run the suites**

```bash
npm test
npm run test:db
npm run build
```

- [ ] **Step 2: Walk the acceptance list in the spec on staging**

Use two workspaces with different operators. Include the EICAR test file, a
file that trips a `clamd` archive limit, a file over 1 GB, `.env`,
`report.pdf.exe`, a `..` path, and an over-quota manifest.

- [ ] **Step 3: Confirm the boundary**

The Strong Foam operations repository has no runtime change from this work.

- [ ] **Step 4: Commit any staging fix**

```bash
git commit -m "Fix handoff issues found in staging acceptance."
```

Skip this commit when staging finds nothing.

## Done when

Every acceptance item in the design spec passes on staging with two client
workspaces, and the Strong Foam operations application is unchanged.
