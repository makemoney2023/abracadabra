# Changelog

## 2026-09-24 — Orbital Horizon landing hero

- Replaced the static landing intro with OpenHero’s `orbital-horizon` video treatment, adapted to the existing Schema copy and URL scan form.
- Kept the scan flow unchanged and added a gradient fallback for browsers that block autoplay.
- Decorative video playback pauses when `prefers-reduced-motion: reduce` is active.
- Added Playwright coverage for the hero contract and reduced-motion behavior.

## 2026-09-23 — Readiness Check

Shipped the Readiness Check inside Schema: `/check`, token sessions, email gate, four scores, suggestions, offers, PDF download, Cal.com embed with a mailto fallback, booking webhook, and an ops Check column.

Production still needs, and this commit does not invent:

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the live Schema Vercel project (the public scan form still fails with "Missing Supabase admin env" until those exist).
- `NEXT_PUBLIC_CAL_LINK` and `CAL_WEBHOOK_SECRET` once a Cal.com "Working session" event and webhook exist. Until the link is set, the results page offers `mailto:dev@pirx.ca`.
- DNS for `check.abra-ca-dabra.app` pointed at this deployment, with `NEXT_PUBLIC_CHECK_URL=https://check.abra-ca-dabra.app`.
