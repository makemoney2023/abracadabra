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

`npm test` runs the unit suite and skips `tests/db`. Those isolation tests need a local Supabase stack (`npx supabase start`, then `npm run test:db`). This environment does not have Docker, so the database suite cannot run here.

Copy `.env.example` to `.env.local` for the Next app and to `.dev.vars` for Wrangler. Leave secrets out of git.

## Cloudflare

The app runs on Cloudflare Workers through OpenNext (`@opennextjs/cloudflare`). File bytes go to R2 with multipart uploads. The malware scan runs in a Cloudflare Container, because a Worker isolate cannot run `clamd`. Postgres, Auth, and row-level security stay on Supabase. Production refuses to start without `SUPABASE_SECRET_KEY`, `DATABASE_URL`, and `RESEND_API_KEY`. `HANDOFF_ALLOW_UNSCANNED=1` is refused when `NODE_ENV=production`.
