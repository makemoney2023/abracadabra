# Pipeline outputs

Stored here for the Abracadabra AI Scrollcraft catalog (`scrollcraft/builds/abracadabra-ai/`).

## Videos

| Product | Files | Source |
| --- | --- | --- |
| Showdesk | `videos/showdesk/showdesk-promo.mp4` plus ringside, review, desk loops and posters | Copied from [makemoney2023/showdesk](https://github.com/makemoney2023/showdesk) `public/videos/` |
| Showdesk live | `videos/showdesk/showdesk-home.mp4` | Playwright capture of https://www.showdesk-app.com/ |
| Schema | `videos/schema/schema-home-scan.mp4` | Playwright capture of https://schema-two.vercel.app/ |
| LLMCourse | `videos/llmcourse/llmcourse-home-lesson.mp4`, `llmcourse-workshops.mp4` | Playwright capture of https://llm-leverage-course.vercel.app/ |
| CDA | `videos/cda/cda-home-path.mp4` | Playwright capture of https://cdastore.vercel.app/ (home scroll, then the "Check my path" click into `/path-check`) |

Raw WebMs live in `footage/`. Recapture with `npm run capture` from this folder (needs `playwright-core` and Playwright ffmpeg).

Scrub-encoded legs for the scroll-world walkthrough are derived from these files and live in `scrollcraft/builds/abracadabra-ai/assets/world/` (see that folder's README for the encode settings).

## Sales enablement

One-pagers and first-demo scripts, chapter-aligned with the footage:

- `sales-enablement/agency/one-pager.md`
- `sales-enablement/showdesk/`
- `sales-enablement/schema/`
- `sales-enablement/llmcourse/`
- `sales-enablement/cda/`

## Not yet

- One continuous Playwright take per product so walkthrough seams match by pixel (see `docs/scroll-world-review.md`)
- CDA warehouse film sections at full play, `/visit`, and a Path Check run with real door numbers
- Schema seeded `/scan/[token]` report walkthrough (the live scan form currently returns "Missing Supabase admin env", so the stored Schema take stops at the home page)
- Remotion compose packs inside Schema, LLMCourse, and CDA (Showdesk remains the reference implementation)
- AE-length recuts with burned-in talk track
