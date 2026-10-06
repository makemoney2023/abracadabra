# Handoff — Design Specification

**Date:** 2026-10-05
**Product:** Handoff
**Status:** Proposed, implementation-ready
**Requirements:** HND-001 through HND-058
**Lives in:** private repository `makemoney2023/clienthandoff`, its own Vercel
project, Supabase project, and Render worker

## Executive summary

Handoff is a private locker where a client sends the files we need to build
their tech stack. Each client gets an isolated workspace. Strong Foam is the
first. Their people drop folders of brand files, photography, copy, data
exports, and reference material. The operators assigned to that client browse
the tree and pull the files down.

```text
operator opens a workspace from a request template
  → client owner and colleagues sign in with a magic link
  → client drops a folder, optionally against an open request
  → browser uploads each file straight to private storage
  → worker hashes and malware-scans the object
  → assigned operators are emailed and pull the clean batch
  → engagement ends: archive, final export, recorded purge
```

A drop changes nothing in any client system. It does not create a customer, a
price, a job, a page, or an import batch. Someone on the build team carries a
chosen file into the client's product by hand, later, outside Handoff.

Handoff is not a module of the Strong Foam operations platform. It does not
share that database, its session cookies, its field login, its Vercel Blob
store, or any of its routes. Shipping Handoff requires no change to the
operations application or to `docs/strongfoam-crm-erp-prd.md`.

## Current state

The operations app accepts a few private PDFs and images, 25 MB each, on a
lead, a job, or an opportunity. Those uploads are evidence for estimating and
field work. They are the wrong place for a brand library, a photo archive, or
an export of the system a client uses today, and they serve one company only.

There is no place for any client to send a folder to the people building
their software.

## Goals

1. Serve many clients from one deployment, with workspace isolation enforced
   in the database and in storage, not by running separate copies.
2. Let an invited person upload a folder, or many files, without an account in
   any client system.
3. Let a client owner invite and remove colleagues without waiting on us.
4. Let operators say what they need through a per-workspace request checklist
   built from reusable templates.
5. Accept large files by uploading bytes directly to private storage, with
   retry and resume.
6. Hold every object until a malware scan finishes, and keep rejected or held
   files closed.
7. Let operators pull a whole batch down with its folder tree intact.
8. Tell operators when a batch is ready, and tell clients when a file is
   rejected or a request is still open.
9. Record who uploaded, who downloaded, who exported, and who changed access.
10. End an engagement on purpose: archive, final export, and a recorded purge.

## Non-goals

- A route, table, role, or session inside the Strong Foam operations
  platform.
- Creating or updating records in any client system.
- Reading file contents with a model, running OCR, or generating thumbnails.
- Rendering uploaded HTML, SVG, PDF, or images inside the portal.
- Unpacking ZIP archives into separate files.
- Two-way sync with a laptop folder.
- Versioning one path in place. A later drop is a new batch, even when a
  relative path repeats. Repeated content is shown through its hash.
- Comments, threaded discussion, or file-level permissions.
- Serving clients whose data must live outside the deployment's region. That
  client gets a separate regional deployment (HND-056).
- Proposal review, job photos, warranty, or any customer of a construction
  job. Those portals belong to the operations platform and are specified
  separately.

## Terms

- **Workspace:** One client engagement. A client may have several over time.
- **Super-admin:** A build-team person who creates workspaces, assigns
  operators, sets file policy, releases held files, and purges.
- **Operator:** A build-team person assigned to one or more workspaces.
- **Client owner:** A person from the client who can upload and can invite or
  remove client members in that workspace.
- **Client member:** A person from the client who can upload in that
  workspace.
- **Request:** One item on a workspace's checklist, such as "Primary logo in
  vector format."
- **Request template:** A reusable list of requests used to start a workspace.
- **File policy profile:** A named, code-defined set of allowed extensions and
  limits. A workspace uses exactly one.
- **Batch:** One drop. It has a label, an optional note, an optional request,
  and a set of files.
- **Relative path:** The folder path from the client's machine, stored as a
  label. It is not the storage key.
- **Object key:** The server-chosen private path
  `{workspaceId}/{batchId}/{fileId}`.
- **Export:** A list of short-lived download links for every clean file in a
  batch, with paths and hashes.

## Roles and access

**HND-001.** A person signs in only by email magic link through Supabase
Auth. Handoff does not accept any operations-platform session, and no other
product accepts a Handoff session.

**HND-002.** The first super-admin is created from
`HANDOFF_SUPER_ADMIN_EMAILS` when the staff table is empty. After that, staff
are rows. A super-admin adds or removes staff and marks a staff row as
super-admin. Removing a row ends access on the next request.

**HND-003.** A super-admin assigns operators to a workspace. An operator sees
only assigned workspaces. A super-admin sees every workspace.

**HND-004.** An invite records a workspace, an email, a role (`client_owner`
or `client_member`), the inviter, and a 14-day expiry. The email is a Supabase
magic link that returns to `/invites/[inviteId]`. The invite id is not a
secret. Acceptance requires a signed-in user whose verified email equals the
invite email, a live invite, and a workspace that is not archived. One live
invite exists per email per workspace. Resending sends a new link and keeps
the same invite row.

**HND-005.** Accepting an invite creates a membership keyed by the Supabase
user id. The email is stored for display. A later change of email address
does not break the membership.

**HND-006.** Permissions:

| Action | Super-admin | Assigned operator | Client owner | Client member |
|---|---|---|---|---|
| See the workspace | all | assigned | own | own |
| Create workspaces, assign operators, set policy profile and quota | yes | no | no | no |
| Invite or remove client owners | yes | yes | no | no |
| Invite or remove client members | yes | yes | yes | no |
| Manage requests | yes | yes | no | no |
| Create a batch and upload | no | no | yes | yes |
| Download a clean file | yes | yes | yes | yes |
| Discard a batch with no clean file | yes | yes | own batches | own batches |
| Change a file tag | yes | yes | no | no |
| Export a batch | yes | yes | no | no |
| Delete a batch | yes | yes | no | no |
| Release or reject a held file | yes | no | no | no |
| Archive a workspace | yes | yes | no | no |
| Export or purge a workspace | yes | no | no | no |

Staff do not upload into client workspaces. Material from the build team does
not belong in the client's locker.

**HND-007.** A signed-out visitor, a signed-in person with no live membership,
or an operator not assigned to a workspace receives no workspace name,
filename, request, or object key for that workspace. A route returns 404, not
403, for a workspace the caller cannot see.

**HND-008.** Isolation is enforced twice. Server routes call one pure
authorization function before any query. Row-level security on every table and
on `storage.objects` limits an authenticated user to rows in workspaces they
belong to. A defect in one layer does not expose another client.

## Workspaces and branding

**HND-009.** A workspace has a name, a unique slug, a display name, an
optional logo, an email sender name, a file policy profile, a storage quota, a
retention period, a status (`active`, `archived`, `purged`), and the date it
was opened.

**HND-010.** The workspace logo is uploaded by staff, PNG or WebP only, at most
512 KB. The server decodes and re-encodes it before storing. It is served from
a separate `branding` bucket. Client uploads are never displayed as a logo.

**HND-011.** The product chrome, empty states, and emails use the workspace
display name and logo. No screen or email names Strong Foam unless that is the
current workspace.

**HND-012.** The default storage quota is 100 GB per workspace. A batch whose
manifest would take the workspace over its quota is refused. A super-admin may
raise it.

## Requests

**HND-013.** A request has a title, optional guidance of at most 2,000
characters, an optional suggested tag, an optional due date, and a status
(`open`, `received`, `closed`).

**HND-014.** A request template is a named, ordered list of request titles,
guidance, and suggested tags. Staff can create and edit templates. Opening a
workspace from a template copies its items into that workspace. Later edits
to the template do not change existing workspaces.

**HND-015.** A batch may name one open request in that workspace. When its
first file becomes clean, the request moves to `received`. An operator
moves it to `closed` or back to `open`.

**HND-016.** The workspace home shows open requests first, then received and
closed. A client can start a drop from a request; the drop screen shows the
request guidance.

**HND-017.** Templates and requests are workspace-scoped data with no access
to files outside that workspace.

## Upload

**HND-018.** The browser sends a manifest. Each entry has a relative path, a
byte size, a declared content type, and an optional tag. The request body
carries no file bytes. A manifest larger than 1 MB is refused.

**HND-019.** The server checks the whole manifest before it writes a batch.
One invalid entry refuses the batch and returns that entry's reason.

| Rule | Default |
|---|---|
| Files in one batch | 2,000 |
| Bytes in one batch | 10 GB |
| Bytes in one file | 2 GB |
| Empty file | refused |
| Relative path length | 512 characters |
| Path depth | 16 segments |
| Segment length | 255 characters |
| Batches started per workspace | 10 per rolling hour |
| Workspace quota | HND-012 |

**HND-020.** A relative path is a normalized label. The server compares names
in Unicode NFC and rejects absolute paths, backslashes, `.` and `..` segments,
empty segments, control characters, and any segment that starts with a dot.
Two entries that normalize to the same path refuse the batch.

**HND-021.** File policy profiles are defined in code. A super-admin chooses
one per workspace. Extensions are compared case-insensitively.

`standard`:

| Group | Extensions |
|---|---|
| Images | `jpg`, `jpeg`, `png`, `webp`, `gif`, `tif`, `tiff`, `heic`, `svg` |
| Design | `ai`, `eps`, `psd`, `indd`, `fig`, `sketch` |
| Video | `mp4`, `mov`, `webm` |
| Documents | `pdf`, `doc`, `docx`, `xls`, `xlsx`, `csv`, `ppt`, `pptx`, `txt`, `md`, `rtf` |
| Data | `json`, `xml` |
| Web snapshot | `html`, `htm`, `css` |
| Fonts | `otf`, `ttf`, `woff`, `woff2` |
| Archive | `zip` |
| Drawings | `dwg`, `dxf` |
| Icon | `ico` |

`software` is `standard` plus:

| Group | Extensions |
|---|---|
| Source | `js`, `mjs`, `cjs`, `ts`, `tsx`, `jsx`, `py`, `rb`, `php`, `java`, `go`, `rs`, `cs`, `swift`, `kt`, `vue`, `svelte` |
| Config | `yaml`, `yml`, `toml`, `ini` |
| Database | `sql` |
| Archive | `tar`, `gz`, `tgz` |

A new profile is a code change with tests.

**HND-022.** These names are refused under every profile: `.env` and every
`.env.*`, `id_rsa`, `id_ed25519`, and any file with extension `pem`, `key`,
`p12`, `pfx`, `kdbx`, `keychain`, `exe`, `dll`, `bat`, `cmd`, `com`, `scr`,
`ps1`, `msi`, `jar`, `app`, `dmg`, `7z`, `rar`. An allowed extension that
follows a refused one, such as `setup.exe.pdf`, is refused. A refused
extension that follows an allowed one, such as `report.pdf.exe`, is refused.

**HND-023.** On success the server writes one batch and one file row per
entry, status `pending`, and returns an object key per file.

**HND-024.** The browser uploads each object with the Supabase Storage
resumable protocol, in chunks of 6 MiB, at most 3 files at a time. Bytes do
not pass through the Next.js server. The Supabase project is on a paid plan
whose global file size limit is at least 2 GB, and the `handoff` bucket file
limit is set to the largest file cap of any profile.

**HND-025.** A batch accepts uploads while it is active. It stays active until
6 hours pass with no completed chunk or file, and never longer than 24 hours
after creation. Each completed file and each grant refresh records activity.
After the window closes, files still `pending` or `uploading` become `failed`.

**HND-026.** Storage write access exists only while a file row is `pending`,
`uploading`, or `failed`, the batch is active, the caller is a live member of
that workspace, and the object name equals that row's key. Clean, held,
rejected, and uploaded files are not writable again.

**HND-027.** The completion call is idempotent. The server confirms the
private object exists and its size equals the manifest size, marks the file
`uploaded`, and enqueues a scan. A second completion returns the current row
and enqueues nothing. A size mismatch marks the file `failed` and deletes the
object.

**HND-028.** The upload screen shows the folder tree, per-file progress, and
a count of finished, failed, and remaining files. While a transfer is in
flight, closing or reloading the page asks for confirmation. A failed file can
be retried from the same batch while it is active. A phone that cannot pick a
directory still accepts a multi-file selection, and the screen tells the
person to use a computer for a whole folder.

**HND-029.** The client may set a batch label and a note of at most 2,000
characters. Allowed tags are `brand`, `photo`, `copy`, `data_export`,
`reference`, `source`, and `other`. Operators may change a tag later. A tag
does not start an import, a publish, or a scan.

## Scan worker

**HND-030.** One Render background worker, built from a Docker image that
runs `clamd` and the Handoff worker process together, is the only code that
moves a file out of `uploaded`. It serves no traffic except a health check
and stores nothing durable on disk. Render's filesystem is ephemeral, so the
ClamAV signature database is downloaded by `freshclam` at start and refreshed
on a schedule.

**HND-031.** The worker claims `uploaded` files with `FOR UPDATE SKIP
LOCKED`, marks them `scanning`, and streams each object once from private
storage. In that single read it computes the SHA-256, checks the leading bytes
against the extension's signature, and streams the bytes to `clamd` over
`INSTREAM`.

**HND-032.** `clamd` is configured so `StreamMaxLength`, `MaxFileSize`, and
`MaxScanSize` are at least the largest file cap of any profile. Archive
scanning is enabled with limits on nested depth, file count, and expanded
bytes. When a limit is reached, the result is `held`, not `clean`.

**HND-033.** Signature check outcomes:

| Extension | Check |
|---|---|
| Image, PDF, ZIP, Office Open XML, font, video | Leading bytes must match the known signature |
| `txt`, `md`, `csv`, `json`, `xml`, `svg`, `html`, `htm`, `css`, source, config, `sql` | Must not start with a known executable signature |
| Design, drawing, `heic`, `ico` | Extension and size only |

**HND-034.** A file becomes:

| Status | When |
|---|---|
| `clean` | Signature check passes and `clamd` reports no finding |
| `rejected` | Signature check fails, or `clamd` reports a finding |
| `held` | `clamd` reports a limit was reached, or a scan error repeats 5 times |

A scanner outage or worker crash returns the file to `uploaded` with
exponential backoff. A file never becomes `clean` because the scanner was
unavailable.

**HND-035.** Production refuses to start the worker without a reachable
`clamd`. A development flag, `HANDOFF_ALLOW_UNSCANNED=1`, lets signature
checks alone mark a file clean, and is refused when `NODE_ENV=production`.

**HND-036.** A super-admin may release a held file to `clean` or reject it,
with a written reason. Clients cannot download a held file.

**HND-037.** A rejected or failed object is deleted after 14 days. The row
remains with its reason.

**HND-038.** The same worker sweeps closed batch windows (HND-025), sends
queued notifications (HND-045), and runs retention and purge jobs (HND-050).

## Download and export

**HND-039.** A download is a private signed URL that expires in 5 minutes,
issued only for a `clean` file to someone allowed by HND-006. The response
disposition is attachment. The portal does not preview, transcode, or inline
any uploaded object.

**HND-040.** The batch screen shows the tree, each file's size, tag, status,
and hash, and marks a file whose hash already appears in an earlier clean file
in the same workspace.

**HND-041.** An operator export returns a JSON document for one batch:
workspace slug, batch id, label, and for each clean file its relative path,
size, SHA-256, and a signed URL that expires in 60 minutes. Held, rejected,
and failed files are listed without URLs. Each export writes an audit event.

**HND-042.** The repository ships a command, `handoff pull <export.json>
<dir>`, that downloads every URL into the relative path under `<dir>`,
verifies each SHA-256, skips files already present with a matching hash, and
refuses a path that would leave `<dir>`.

**HND-043.** v1 does not build ZIPs on the server.

## Notifications

**HND-044.** Auth email (magic link and invite) uses custom SMTP through
Resend, configured on the Handoff Supabase project, with Handoff templates.
The built-in Supabase sender is not used outside local development.

**HND-045.** Product email is sent through Resend from a `notifications` table
with a unique idempotency key per event and recipient.

| Event | Recipients |
|---|---|
| Batch finishes scanning with at least one clean file | Assigned operators |
| A file is rejected or held | The uploader and assigned operators |
| A file is released or rejected from held | The uploader |
| Batch window closes with failed files | The uploader |
| Weekly digest of open requests | Client owners, when the workspace enables it |
| Workspace archived, purge scheduled | Client owners and assigned operators |

**HND-046.** Email shows the workspace display name, a batch or request
title, counts, and a link into Handoff. It never includes a signed URL,
file bytes, or a scan finding beyond its name.

## Records

**HND-047.** Identifiers are UUIDs. Byte sizes are 64-bit integers.
Timestamps are timezone-aware. Emails are stored lowercase.

| Table | Purpose |
|---|---|
| `staff` | `user_id`, `email`, `is_super_admin`, `created_at`, `revoked_at` |
| `workspaces` | `id`, `slug`, `name`, `display_name`, `logo_object_key`, `sender_name`, `policy_profile`, `quota_bytes`, `retention_days`, `request_digest`, `status`, `opened_at`, `archived_at`, `purge_after`, `purged_at` |
| `workspace_operators` | `workspace_id`, `user_id`, `assigned_by`, `assigned_at`, `removed_at` |
| `invites` | `id`, `workspace_id`, `email`, `role`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at` |
| `memberships` | `workspace_id`, `user_id`, `email`, `role`, `created_at`, `revoked_at` |
| `request_templates` | `id`, `name`, `created_by`, `created_at`, `retired_at` |
| `request_template_items` | `id`, `template_id`, `position`, `title`, `guidance`, `suggested_tag` |
| `requests` | `id`, `workspace_id`, `position`, `title`, `guidance`, `suggested_tag`, `due_on`, `status`, `received_at`, `closed_at` |
| `batches` | `id`, `workspace_id`, `request_id`, `created_by`, `label`, `note`, `created_at`, `last_activity_at`, `discarded_at`, `deleted_at` |
| `files` | `id`, `batch_id`, `workspace_id`, `relative_path`, `extension`, `declared_content_type`, `size_bytes`, `object_key`, `tag`, `status`, `sha256`, `scan_reason`, `scan_attempts`, `next_scan_at`, `created_at`, `uploaded_at`, `scanned_at`, `object_deleted_at` |
| `notifications` | `id`, `workspace_id`, `event`, `recipient_email`, `idempotency_key`, `payload`, `sent_at`, `attempts` |
| `audit_events` | `id`, `workspace_id`, `actor_user_id`, `action`, `subject_type`, `subject_id`, `at`, `metadata` |

Unique constraints: `workspaces.slug`, `files.object_key`,
`(batch_id, relative_path)`, `(workspace_id, user_id)` on live memberships,
`(workspace_id, email)` on live invites, `notifications.idempotency_key`.
Index `(workspace_id, sha256)` on files.

**HND-048.** Batch status is derived and not stored, except discard and
delete:

| Status | When |
|---|---|
| `discarded` | `discarded_at` or `deleted_at` is set |
| `uploading` | Any file is `pending`, `uploading`, or `failed`, and the window is open |
| `scanning` | Every file is past upload, and at least one is `uploaded` or `scanning` |
| `needs_review` | At least one file is `held`, and none is in flight |
| `ready` | At least one file is `clean`, and none is in flight or held |
| `rejected` | Every file is `rejected` or `failed`, and none is in flight |

File status: `pending` → `uploading` → `uploaded` → `scanning` → `clean`,
`rejected`, or `held`. `held` → `clean` or `rejected` by a super-admin.
`pending`, `uploading`, and `uploaded` may become `failed`. `failed` may
return to `uploading` while the batch is active.

**HND-049.** Audit actions: `staff.added`, `staff.removed`,
`workspace.created`, `workspace.updated`, `workspace.archived`,
`workspace.exported`, `workspace.purged`, `operator.assigned`,
`operator.removed`, `invite.created`, `invite.revoked`, `invite.accepted`,
`member.removed`, `request.created`, `request.updated`, `batch.created`,
`batch.discarded`, `batch.deleted`, `batch.exported`, `file.uploaded`,
`file.scanned`, `file.held`, `file.released`, `file.downloaded`,
`file.tagged`. Metadata may include relative paths, sizes, tags, hashes, and
scan reasons. It never includes signed URLs, tokens, or file bytes. Audit rows
for a purged workspace remain.

## Engagement end

**HND-050.** Archiving a workspace refuses new batches, invites, and
requests. Clean files stay downloadable. Archive sets `purge_after` to the
archive date plus `retention_days`, 90 by default.

**HND-051.** A super-admin can produce a workspace export: one JSON document
covering every batch, built the same way as HND-041, with links valid for 24
hours. It writes `workspace.exported`.

**HND-052.** On or after `purge_after`, the worker deletes every object in
the workspace, deletes file, batch, request, invite, and membership rows, sets
`status` to `purged`, and records counts and bytes deleted in
`workspace.purged`. A super-admin can purge early with a written reason. A
purge never runs on an `active` workspace.

**HND-053.** Owners and operators are emailed when a workspace is archived,
with the purge date, and again 7 days before purge.

## Security and deployment

**HND-054.** Server and worker secrets: `SUPABASE_SECRET_KEY`,
`DATABASE_URL`, `DIRECT_URL`, and `RESEND_API_KEY`. The browser receives only
the project URL and the publishable key. No `NEXT_PUBLIC_` variable contains a
secret.

**HND-055.** Logs may include workspace id, batch id, file id, status, and
counts. They never include object bytes, magic-link or session tokens, signed
URLs, or keys.

**HND-056.** One deployment serves one data region. The region is recorded in
configuration and shown to super-admins. Strong Foam's deployment uses the
region already chosen for its operations platform. A client whose data must
stay elsewhere gets another deployment from the same repository, in that
region. Workspaces never move between deployments.

**HND-057.** Rate limits, counted in the database: 10 batches per workspace
per hour, 30 invites per inviter per day, 20 exports per operator per hour.
Magic-link requests are limited by Supabase Auth.

**HND-058.** The drop screen states that Handoff is for brand files, photos,
copy, exports, source, and reference files, and that passwords, key files, and
environment files are refused. It links to a plain description of how files
are scanned, who can see them, and when they are purged.

## Environment

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY              Server and worker only
DATABASE_URL                     Pooled Postgres connection
DIRECT_URL                       Migration connection
RESEND_API_KEY                   Server and worker only
HANDOFF_FROM_EMAIL               Product email sender address
HANDOFF_BUCKET=handoff
HANDOFF_BRANDING_BUCKET=branding
HANDOFF_SUPER_ADMIN_EMAILS       Bootstrap only, comma-separated
HANDOFF_REGION                   Displayed data region
CLAMD_HOST=127.0.0.1             Worker only
CLAMD_PORT=3310                  Worker only
HANDOFF_ALLOW_UNSCANNED          Development only; refused in production
```

## Acceptance

A deployment is ready for its first client invite when all of the following
are true:

1. A super-admin creates two workspaces from a request template and assigns a
   different operator to each. Each operator sees only their workspace.
2. A client owner accepts an invite, invites a colleague, and that colleague
   uploads. Neither sees the other workspace through any page, route, or
   direct database or storage query with their own session.
3. A nested folder of mixed allowed types, including one file over 1 GB,
   uploads with per-file progress and survives a retry.
4. A file over the cap, a `.env` file, a `report.pdf.exe`, a path with `..`,
   and a manifest over quota never create an object.
5. The EICAR test file is rejected. A file that hits a `clamd` limit is held
   and can be released only by a super-admin.
6. A clean batch emails the assigned operator. `handoff pull` recreates the
   folder tree and verifies every hash.
7. A request moves to `received` when a drop that names it has a clean file.
8. Removing a membership blocks the next request from that person.
9. Archive emails the owner with a purge date, and a purge deletes every
   object while keeping the audit rows.
10. Unit tests run with no network. Database tests run against a local
    Supabase stack and prove row-level security and storage policies isolate
    workspaces.
11. No table, cookie, or route in the Strong Foam operations application
    changes as part of this work.
