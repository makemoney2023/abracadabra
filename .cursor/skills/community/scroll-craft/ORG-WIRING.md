# Org wiring (ClaudeSkills)

This folder is the vendored [scroll-craft](https://github.com/nateherkai/scroll-craft) plugin. The craft entry is:

`plugins/nateherk-design/skills/scrollcraft/SKILL.md`

It builds premium scroll-driven pages. Scroll is the timeline. Eight page grammars, a required signature move, a feeling curve with one peak, and a screenshot harness that fails dead scroll and weak contrast.

| Seat | Use |
|------|-----|
| `web-designer` | Phase 12 owner. Run the interview, pick grammar, write the feeling curve, signature move, and fingerprint into `12-web-design.md`. Do not ship the HTML page yourself |
| `tech-lead` | Phase 9 / 14 implementer. Theme the engine (six colour tokens, two fonts). Never edit `engine/`. Drive bespoke motion off `--sc-p` |
| `creative-director` | Review-only. Reject adjacent acts with the same feeling, missing peak, or a fingerprint that collides with a prior build |
| `cmo` / copy seats | Supply voice and journey in the interview. They do not pick grammar or implement the engine |

**Do not use scrollcraft when:** the page is app chrome, a dashboard, or a standard marketing template. Those stay shadcn + design-system. Scrollcraft is for a landing experience that must not look like the last one.

**SSOT**

| Kind | Path |
|------|------|
| Plan (grammar, feel, peak, fingerprint, signature move) | `docs/projects/<active>/business-idea/12-web-design.md` |
| Implemented page | `apps/<venture>/` (Tech Lead). Standalone lab builds may use the skill workspace under `scrollcraft/builds/<name>/` |
| Fingerprint registry | nearest `.scrollcraft.json` workspace, or `scrollcraft/FINGERPRINTS.md` |

**First run on this Mac**

```bash
cd skills/community/scroll-craft/plugins/nateherk-design/skills/scrollcraft
node scripts/doctor.mjs
node scripts/workspace.mjs --ensure
```

`SCROLLCRAFT_FFMPEG` and `SCROLLCRAFT_CHROME` override discovery if doctor cannot find them.

**Engine rule:** theme tokens and fonts only. A page built from a config object is how every AI site ends up looking the same.

Keep upstream `SKILL.md` as the procedure. Re-vendor from upstream when updating.
