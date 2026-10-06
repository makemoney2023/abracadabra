# abracadabra

Project Cursor skills live in [`.cursor/skills/`](.cursor/skills/README.md). They were copied from [SourceControl](https://github.com/makemoney2023/SourceControl) with the team/org pack (`skills/org`) left out.

The Showdesk-style product video queue — including LLMCourse and sales enablement — is in [docs/video-pipeline-targets.md](docs/video-pipeline-targets.md).

Captured films, posters, and sales packs live in [`outputs/`](outputs/README.md). The one-page catalog for Abracadabra AI is [`scrollcraft/builds/abracadabra-ai/`](scrollcraft/builds/abracadabra-ai/); its product walkthrough is a scroll-world flight (`walkthrough.html`). Review and improvement plan: [docs/scroll-world-review.md](docs/scroll-world-review.md).

The detailed UX and visual redesign plan for making the marketing site feel technologically magical — while preserving its proof-first operator voice — is [docs/marketing-site-technological-magic-plan.md](docs/marketing-site-technological-magic-plan.md).

The homepage chapter that leads into Answer Engine Optimization says the screen follows the order of work the team already trusts: marketing, applications, machine learning with PIRX, the customer record, and the sale. It sits between Time and Answer. The spec is [docs/anything-digital-lead-in-plan.md](docs/anything-digital-lead-in-plan.md).

The plan for the Readiness Check — the lead-generation survey that scores problems, AI readiness, and website structure (via the Schema repo) and ends in a booked session — is [docs/lead-survey-gameplan.md](docs/lead-survey-gameplan.md); its design spec and implementation plan are in [docs/readiness-check/](docs/readiness-check/).

The Handoff app build plan — a multi-client locker where invited people drop brand, photo, copy, export, and reference files — is [docs/superpowers/plans/2026-10-05-handoff-portal.md](docs/superpowers/plans/2026-10-05-handoff-portal.md). Its design spec is [docs/superpowers/specs/2026-10-05-handoff-portal-design.md](docs/superpowers/specs/2026-10-05-handoff-portal-design.md). Both were copied from Strong Foam (`cursor/handoff-portal-spec-fd0f`). The app itself is built in `makemoney2023/clienthandoff`, not in this repository. That plan can deploy on Cloudflare: Workers and OpenNext for the app, R2 for files, a Container for the malware scan, and Supabase kept for Postgres, Auth, and row-level security.
