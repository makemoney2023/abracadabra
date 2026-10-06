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

`npm test` runs the unit suite, including workspace isolation. Those tests apply `migrations/0001_handoff.sql` to Node's built-in SQLite. `npm run test:db` runs the same isolation file. No Docker or hosted database is required.

Copy `.env.example` to `.env.local` for the Next app and to `.dev.vars` for Wrangler. Leave secrets out of git. Local runs that are not inside a Worker store records in `.data/handoff.db`.

## Cloudflare

The app runs on Cloudflare Workers through OpenNext (`@opennextjs/cloudflare`). Locker records live in D1 database `handoff`, bound as `DB` in `wrangler.jsonc`. File bytes go to R2 with multipart uploads once R2 is enabled on the account. The malware scan runs in a Cloudflare Container, because a Worker isolate cannot run `clamd`. Magic links go out through Resend and the session lives in D1 (`users`, `magic_links`, and `sessions` in `migrations/0002_sessions.sql`). A link is sent only for an allow-listed bootstrap address while staff is empty, or for a live staff, membership, or active-workspace invite. The form does not say which case applied. Production refuses to start without `RESEND_API_KEY`. `HANDOFF_ALLOW_UNSCANNED=1` is refused when `NODE_ENV=production`.

`GET /api/health` migrates a local database if needed and reports `{ database: "d1", ok, visible }` for a signed-out caller. `visible` is how many workspaces that caller can see. It does not list names or counts of hidden rows.
