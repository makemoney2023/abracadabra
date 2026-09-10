# UI UX Pro Max Skills

Design intelligence skills from [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT License).

**Source:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill  
**Publisher:** [UI UX Pro Max](https://uupm.cc) / [NextLevelBuilder](https://nextlevelbuilder.io)

Paths in these skills are adapted for **Cursor** (`.cursor/skills/` instead of `.claude/skills/`).

## Skills (7)

| Skill | Purpose |
|-------|---------|
| `ui-ux-pro-max` | Core design intelligence — 84 styles, 192 palettes, UX guidelines, 22 stacks |
| `design-system` | Token architecture, component specs, slide generation |
| `design` | Logo, icon, CIP design, design routing |
| `brand` | Brand voice, visual identity, messaging, asset management |
| `ui-styling` | UI styling with canvas fonts and references |
| `slides` | Slide/presentation layout and copywriting |
| `banner-design` | Banner design workflows |

## ui-ux-pro-max (flagship)

Searchable database: styles, color palettes, typography, UX guidelines, icons, GSAP motion, charts across React, Next.js, Vue, shadcn, Tailwind, Flutter, SwiftUI, and more.

```bash
# After copying to your project:
python .cursor/skills/ui-ux-pro-max/scripts/search.py "SaaS dashboard minimal" --design-system -p "My App"

python .cursor/skills/ui-ux-pro-max/scripts/search.py "glassmorphism dark" --domain style

python .cursor/skills/ui-ux-pro-max/scripts/search.py "suspense streaming" --stack nextjs
```

Requires Python 3.x, no external dependencies.

### Persist design system

```bash
python .cursor/skills/ui-ux-pro-max/scripts/search.py "analytics dashboard" \
  --design-system --persist -p "Ops Console" --output-dir "<project-root>"
```

Creates `design-system/<project-slug>/MASTER.md` in your project.

## Usage

Copy individual skills or the full suite:

```bash
# Flagship only
cp -r skills/community/ui-ux-pro-max-skill/ui-ux-pro-max /path/to/project/.cursor/skills/

# Full design suite
cp -r skills/community/ui-ux-pro-max-skill/{ui-ux-pro-max,design-system,design,brand} /path/to/project/.cursor/skills/
```

## Optional dependencies

Some skills reference tools from the broader ClaudeKit ecosystem (not bundled here):

| Referenced skill | Used by | Notes |
|------------------|---------|-------|
| `ai-multimodal` | `banner-design` | Gemini image generation |
| `ai-artist` | `banner-design` | Style search |
| `chrome-devtools` | `banner-design` | Screenshots |

`brand` → `design-system` and `slides` → `design-system` work when both are copied together.

## License

MIT — see [LICENSE](./LICENSE).
