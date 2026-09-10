# Org wiring (ClaudeSkills)

This folder is the vendored [img2threejs](https://github.com/img2threejs/img2threejs) skill for the digital organization.

**Spec (generate/consume):** `docs/superpowers/specs/2026-08-10-img2threejs-org-wiring-design.md`  
**Spec (cinematic presentation example):** `docs/superpowers/specs/2026-08-10-income-stack-cinematic-hero3d-design.md`  
**Presentation stack (reusable):** [`CINEMATIC-HERO-STACK.md`](./CINEMATIC-HERO-STACK.md)

| Seat | Use |
|------|-----|
| `web-designer` | Generate hero product 3D (Phase 12) when a product reference exists; document cinematic look targets in `design-system/<venture>/3d/README.md` |
| `tech-lead` | Consume `design-system/<venture>/3d/` into `apps/<venture>/`; for interactive cinematic islands use **CINEMATIC-HERO-STACK** (R3F + Drei + Rapier + selective bloom) |
| `creative-director` | Review hero 3D scope + cinematic presentation coherence only |

**SSOT output:** `design-system/<venture>/3d/` (spec JSON + TypeScript factory + `review/` + README).

**Presentation mount (optional, Tech Lead):** R3F island in the venture app — physics accordion, mobile-first tiers, cinematic post — per `CINEMATIC-HERO-STACK.md`. Does not replace the SSOT factory.

Keep upstream `SKILL.md` as the craft entrypoint. Re-vendor manually when updating from upstream. Refresh Context7 docs (`skills/integrations/context7-docs/`) before integrating library APIs from the cinematic stack.
