# Pipeline outputs

Stored here for the Abracadabra AI Scrollcraft catalog (`scrollcraft/builds/abracadabra-ai/`).

## Videos

| Product | Files | Source |
| --- | --- | --- |
| Showdesk | `videos/showdesk/showdesk-promo.mp4` plus ringside, review, desk loops and posters | Copied from [makemoney2023/showdesk](https://github.com/makemoney2023/showdesk) `public/videos/` |
| Showdesk live | `videos/showdesk/showdesk-home.mp4` | Playwright capture of https://www.showdesk-app.com/ |
| Schema | `videos/schema/schema-home-scan.mp4` | Playwright capture of https://schema-two.vercel.app/ |
| LLMCourse | `videos/llmcourse/llmcourse-home-lesson.mp4`, `llmcourse-workshops.mp4` | Playwright capture of https://llm-leverage-course.vercel.app/ |
| CDA | `videos/cda/cda-home-pdp.mp4` | Playwright capture of https://www.cdastore.ca/ (home; PDP click did not land on this pass) |

Raw WebMs live in `footage/`. Recapture with `npm run capture` from this folder (needs `playwright-core` and Playwright ffmpeg).

## Sales enablement

One-pagers and first-demo scripts, chapter-aligned with the footage:

- `sales-enablement/agency/one-pager.md`
- `sales-enablement/showdesk/`
- `sales-enablement/schema/`
- `sales-enablement/llmcourse/`
- `sales-enablement/cda/`

## Not yet

- CDA private-repo demo-mode capture (catalog + seeded PDP)
- Schema seeded `/scan/[token]` report walkthrough
- Remotion compose packs inside Schema, LLMCourse, and CDA (Showdesk remains the reference implementation)
- AE-length recuts with burned-in talk track
