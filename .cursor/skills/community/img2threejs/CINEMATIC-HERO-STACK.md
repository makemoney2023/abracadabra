# Cinematic Hero Stack (org reusable)

Presentation-layer libraries for interactive, mobile-first, cinematic product heroes — researched via Context7 and locked for seat reuse across ventures.

**Companion to:** `ORG-WIRING.md` (img2threejs generate/consume)  
**Example spec:** `docs/superpowers/specs/2026-08-10-income-stack-cinematic-hero3d-design.md`

## When to use

Use this stack when Tech Lead (or Web Designer look-dev) needs a **realtime presentation island** that goes beyond the procedural blockout factory:

- Wet reflective ground, selective neon bloom, cinematic grade
- Physics-driven accordion / spring motion (Y-axis open/close)
- Mobile-first interaction (tap toggle; hover optional on desktop)
- Quality tiers (phone vs desktop)

img2threejs remains the **SSOT generator** under `design-system/<venture>/3d/`. This stack is the **app presentation mount** (often hand-crafted materials + R3F scene).

## Library map (Context7)

| Layer | Package | Context7 / docs ID | Primary APIs |
|-------|---------|----------------------|--------------|
| Scene | `@react-three/fiber` | `/pmndrs/react-three-fiber` | `Canvas`, `useFrame`, declarative meshes |
| Helpers | `@react-three/drei` | `/pmndrs/drei` | `MeshReflectorMaterial`, `ContactShadows`, `Environment`, `RoundedBox` |
| Vanilla helpers | `@pmndrs/vanilla` | `/pmndrs/drei-vanilla` | Same reflector/PCSS without R3F when staying imperative |
| Physics | `@react-three/rapier` | `/pmndrs/react-three-rapier` | `Physics`, `RigidBody`, `useSpringJoint`, impulses |
| Physics core | `@dimforge/rapier3d-compat` (via rapier wrapper) | `/dimforge/rapier.js` | WASM rigid bodies / joints |
| Post | `@react-three/postprocessing` | `/pmndrs/react-postprocessing` | `EffectComposer`, `SelectiveBloom`, `DepthOfField`, vignette/grain |
| Post core | `postprocessing` | `/websites/pmndrs_github_io_postprocessing_public` | Passes / effects underlying R3F wrapper |
| Motion fallback | `gsap` / `@gsap/react` | `/websites/gsap_v3` | Reduced-motion Y ease when physics disabled |

### Existing OpenMontage packs (still required)

Keep using these alongside the npm stack — do not replace seat pack table entries:

- `threejs-fundamentals`, `threejs-materials`, `threejs-lighting`, `threejs-interaction`, `threejs-postprocessing`, `threejs-geometry`, `threejs-animation`

## Seat ownership

| Seat | Responsibility |
|------|----------------|
| **Web Designer** | Spec look targets (palette, frost/rim, cinematic grade notes) in `design-system/<venture>/3d/README.md` + Phase 12 index; may author look-dev stills; does **not** own Rapier/R3F app wiring |
| **Tech Lead** | Install npm deps; mount R3F island in `apps/<venture>/`; wire Rapier accordion, selective bloom, reflector, quality tiers, a11y (`prefers-reduced-motion`, tap vs hover); TDD for accordion state + tiers |
| **Creative Director** | Review cinematic read + interaction coherence vs brand/reference; no generation |
| **CTO** | Optional architecture/perf review (bundle, WASM, DPR tiers) via existing threejs packs |

## Default interaction contract

- **Desktop (fine pointer):** hover open / leave close (Y accordion)
- **Mobile (coarse pointer):** tap toggle open/close
- **Reduced motion:** GSAP (or equivalent) ease to targets; no spring oscillation
- **Orbit:** allowed; plates translate on **Y only** (lock rotations / no XZ drift)
- **No scroll-jack** outside the hero canvas (`touch-action: none` on canvas only)

## Quality tiers (mobile-first)

| Tier | Reflector | Bloom | DOF | DPR | Physics step |
|------|-----------|-------|-----|-----|--------------|
| Phone | Low res (~256) | Selective, lower intensity | Off | ≤ 1.5 | ~30 Hz |
| Desktop | Higher (~1024) | Selective + grain/vignette | Subtle on | ≤ 2 | ~60 Hz |

## Honesty

- Single-image product refs cannot guarantee photogrammetry-level likeness.
- “Cinematic” means graded realtime hero, not offline film render.
- Prefer `SelectiveBloom` on neon rims; fall back to tuned global bloom if selection layers fail QA.
- Lazy-load the hero chunk when Rapier WASM would hurt initial app TTI.
