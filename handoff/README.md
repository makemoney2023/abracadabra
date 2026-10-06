# Handoff

Handoff is a private locker. An operator invites someone, they drop files for one workspace, and a scan worker marks each file clean, rejected, or held. Handoff is not part of any client's product. It does not import into a client's app, and it does not share a database, cookie, or package with the operations site.

## One region

Keep the app, the database, and the file bucket in one region. Do not replicate a workspace's files to a second region.

## Local setup

```bash
cd handoff
npm install
npm test
npm run dev
```

`npm test` runs the unit suite, including workspace isolation. Those tests apply `migrations/0001_handoff.sql` and `migrations/0002_sessions.sql` to Node's built-in SQLite. `npm run test:db` runs the same isolation file. No Docker or hosted database is required.

Copy `.env.example` to `.env.local` for the Next app and to `.dev.vars` for Wrangler. Leave secrets out of git. Local runs that are not inside a Worker store records in `.data/handoff.db`.

## Cloudflare

The app runs on Cloudflare Workers through OpenNext (`@opennextjs/cloudflare`). Locker records live in D1 database `handoff`, bound as `DB` in `wrangler.jsonc`. File bytes go to R2 with multipart uploads once R2 is enabled on the account. The malware scan runs in a Cloudflare Container, because a Worker isolate cannot run `clamd`. Magic links go out through Resend and the session lives in D1 (`users`, `magic_links`, and `sessions` in `migrations/0002_sessions.sql`). A link is sent only for an allow-listed bootstrap address while staff is empty, or for a live staff, membership, or active-workspace invite. The form does not say which case applied. Production refuses to start without `RESEND_API_KEY`. `HANDOFF_ALLOW_UNSCANNED=1` is refused when `NODE_ENV=production`.

`GET /api/health` migrates a local database if needed and reports `{ database: "d1", ok, visible }` for a signed-out caller. `visible` is how many workspaces that caller can see. It does not list names or counts of hidden rows.

A super-admin opens a workspace from `/admin`, assigns operators from `/admin/staff`, and sets the file policy and quota. An operator invites a client owner or member from `/w/[slug]/people`. A client owner invites members from that page and cannot invite another owner. The invite email is a magic link that returns to `/invites/[inviteId]`. Acceptance creates a membership keyed by the signed-in user id, and only when that user's email matches the invite, the invite is still live, and the workspace is active. A second live invite for the same email is refused, and one person can send 30 invites in a day. Creating a workspace from a template copies that template's items into `requests`. Later template edits do not change the copy. Staff upload a PNG or WebP logo of at most 512 KB. The server decodes and re-encodes it to PNG before storing it under `.data/branding` (`HANDOFF_BRANDING_PATH` overrides that directory, or the `BRANDING` R2 binding when that bucket exists). The workspace layout shows `display_name` and that logo. A workspace the caller cannot see returns 404. Staff manage request templates at `/admin/templates`. Operators manage requests at `/w/[slug]/requests`. The workspace home lists open requests first, and each open request links to `/w/[slug]/drop?request=` so a later upload can attach to that request. `POST /api/workspaces/[slug]/batches` accepts a JSON manifest of paths and sizes, writes `pending` file rows, and returns object keys shaped `{workspaceId}/{batchId}/{fileId}`. The body carries no file bytes. Staff and callers outside the workspace cannot create a batch. An archived workspace, a closed or foreign request, a blocked name, an over-quota manifest, and an 11th batch in the same hour are refused. A file with no tag inherits the request's suggested tag, or `other`. `POST /api/batches/[batchId]/files/[fileId]/grant` opens a `pending`, `uploading`, or `failed` file in an active batch and refreshes `last_activity_at`. `POST .../complete` reads the stored object size from local object storage (`HANDOFF_OBJECT_PATH`, default `.data/objects`) and does not accept a size in the body. A matching size marks the file `uploaded`, sets `next_scan_at`, and writes one `file.uploaded` audit. A mismatch marks it `failed`, records the reason, and deletes the object. A repeat completion returns the same row. Staff and callers outside the workspace cannot grant or complete. The drop page `/w/[slug]/drop?request=` lets a client member upload a folder or several files. Parts are 6 MiB, three files at a time, through `POST /api/batches/[batchId]/files/[fileId]/multipart` and `PUT /api/objects/parts`. Local bytes land in `HANDOFF_OBJECT_PATH`. Production without that path, and without an R2 bucket, answers 503. The page states which files Handoff accepts and links to `/how-handoff-handles-files`.
