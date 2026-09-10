# Text-to-CAD Skills (11)

**Source:** [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad) · License: MIT

Agent skills for CAD, robotics, fabrication, and hardware design. Each skill is self-contained with bundled `scripts/` — no separate repo-root `packages/` or `viewer/` copy needed.

| Skill | Purpose |
|-------|---------|
| `cad` | STEP-first parametric CAD from plain language or images; STL, 3MF, GLB exports |
| `cad-viewer` | Local browser previews for CAD, G-code, and robot files |
| `step-parts` | Find off-the-shelf STEP parts (screws, bearings, motors, connectors) |
| `dxf` | 2D DXF drawings — profiles, templates, gaskets, cut layouts |
| `urdf` | Robot structure files — links, joints, limits, inertials, meshes |
| `srdf` | MoveIt planning groups, end effectors, collision rules on a URDF |
| `sdf` | Simulator models and worlds — physics, sensors, lights |
| `gcode` | Slice meshes into validated FDM `.gcode` |
| `bambu-labs` | Upload and start Bambu Lab print jobs from validated gcode |
| `sendcutsend` | Pre-upload validation for SendCutSend DXF/STEP files |
| `implicit-cad` | Browser-native implicit CAD via GLSL SDFs (experimental) |

**Requirements:** Python 3.11+ for CAD skills; see each skill's `requirements.txt`. `cad-viewer` is the largest bundle (~18 MB) due to vendored viewer dist.

## Runbook integration

**Phase 9B** in `business-idea-runbook.mdc` runs when intake classifies the idea as hardware, robotics, or physical product. Skills are selected by product type (enclosure → `cad` + `dxf`; robot → `urdf` + `srdf` + `sdf`; prototype → `gcode`).

## Install into a project

```bash
# Minimum for physical product prototyping
cp -r cad cad-viewer step-parts /path/to/project/.cursor/skills/

# Full hardware/robotics suite
cp -r skills/community/text-to-cad/{cad,cad-viewer,step-parts,dxf,urdf,srdf,sdf,gcode,sendcutsend} /path/to/project/.cursor/skills/
```
