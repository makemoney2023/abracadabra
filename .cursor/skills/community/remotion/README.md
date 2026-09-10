# Remotion Skills

Agent skills from [remotion-dev/remotion](https://github.com/remotion-dev/remotion).

**Source:** https://github.com/remotion-dev/remotion  
**Docs:** [remotion.dev/docs](https://www.remotion.dev/docs)  
**License:** See [LICENSE.md](./LICENSE.md) — Remotion has a special license (free for individuals/small orgs; company license may be required for larger for-profit orgs).

## Video skills (8) — `video/`

**Public, redistributable** skills for creating videos programmatically with React. Copy these for end-user video projects.

| Skill | Purpose |
|-------|---------|
| `remotion-create` | Scaffold a new Remotion project and composition |
| `remotion-best-practices` | Hub — routes to other Remotion skills |
| `remotion-markup` | React markup for video (layout, effects, Lottie, etc.) |
| `remotion-interactivity` | Studio Visual Mode — editable animations |
| `remotion-captions` | Captions and subtitles |
| `remotion-render` | Rendering videos (CLI, Node.js, cloud) |
| `remotion-saas` | Building Remotion-powered SaaS apps |
| `mediabunny` | Mediabunny media library integration |

Skills cross-reference each other via relative paths — **copy the whole `video/` folder** to preserve links.

```bash
cp -r skills/community/remotion/video/* /path/to/project/.cursor/skills/
```

### Quick start

```bash
# Scaffold (from remotion-create skill)
npx create-video@latest --yes --blank --no-tailwind my-video
cd my-video && npm i

# Preview
npx remotion studio --no-open
```

## Maintainer skills (40) — `maintainer/`

**Internal** skills for contributing to the Remotion monorepo itself. Most assume you are inside the `remotion-dev/remotion` repository (bun, packages/*, GitHub PR workflows).

| Category | Skills |
|----------|--------|
| **Dev servers** | `studio`, `docs`, `docs-demo`, `convert`, `player-example` |
| **PR / Git** | `pr`, `pr-name`, `pr-ready`, `merge`, `checkout`, `flake` |
| **Releases** | `release`, `version`, `update-version` |
| **Issues** | `issue`, `issue-management`, `add-bug`, `add-webcodecs-bug` |
| **Packages** | `add-new-package`, `add-effect`, `add-sfx`, `add-cli-option`, `add-expert` |
| **Docs** | `writing-docs`, `interactivity-best-practices` |
| **Infra** | `vercel`, `upload-r2`, `update-chrome-binaries-test-region`, `upgrade-caniuse`, `upgrade-mediabunny` |
| **Quality** | `formatting`, `nullable-new-params`, `fix-dependabot`, `web-renderer-test` |
| **Meta** | `skill-locations`, `homepage-video-assets`, `video-report`, `visual-mode`, `update-stars` |

Only copy maintainer skills if you are actively developing Remotion upstream.

## Skill placement (from Remotion)

Per `maintainer/skill-locations`:

- **Internal** → `.agents/skills/` (mapped here as `maintainer/`)
- **Public** → `packages/skills/skills/` (mapped here as `video/`)

## License

Remotion uses a special license — not standard MIT. Read [LICENSE.md](./LICENSE.md) and [remotion.dev/docs/license](https://www.remotion.dev/docs/license) before commercial use.
