import { describe, expect, it } from 'vitest';
import packTemplates from '../pack-templates.json';
import { RENDER_ROLES } from '../mcp/render-roles';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../types';

const RENDER_SKILL = '.cursor/skills/community/muapi-render/SKILL.md';

const WEBSITE_HERO_SKILLS = [
  '.cursor/skills/community/ui-ux-pro-max-skill/banner-design/SKILL.md',
  '.cursor/skills/community/visual-skills/image/SKILL.md',
  '.cursor/skills/community/visual-skills/video/SKILL.md',
];

const AD_STRATEGY_SKILLS = [
  '.cursor/skills/community/advertising-skills/skills/foundations/avatar-extraction/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/foundations/offer-extraction/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/copy-chief/schwartz-awareness-mapper/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/copy-chief/mechanism-builder/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/operator-os/ad-angle-multiplier/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/operator-os/scroll-stopping-creative/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/operator-os/conversion-path-builder/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/copy-chief/objection-crusher/SKILL.md',
  '.cursor/skills/community/advertising-skills/skills/qa/generic-language-killer/SKILL.md',
  '.cursor/skills/community/visual-skills/image/SKILL.md',
  '.cursor/skills/community/visual-skills/video/SKILL.md',
];

function template(id: string): WorkflowTemplate {
  const found = WORKFLOW_TEMPLATES.find((item) => item.id === id);
  if (!found) throw new Error(`missing template ${id}`);
  return found;
}

function nodeNamed(workflow: WorkflowTemplate, name: string) {
  const found = workflow.nodes.find((node) => node.name === name);
  if (!found) throw new Error(`${workflow.id} has no node ${name}`);
  return found;
}

describe('RENDER_ROLES', () => {
  it('lists the shared tool sets from the spec', () => {
    expect(RENDER_ROLES.still).toEqual([
      'search_models',
      'muapi_image_generate',
      'muapi_image_edit',
      'muapi_predict_result',
    ]);
    expect(RENDER_ROLES.animate).toEqual([
      'muapi_video_from_image',
      'muapi_video_generate',
      'muapi_predict_result',
    ]);
    expect(RENDER_ROLES.edit).toEqual(['muapi_image_edit', 'muapi_predict_result']);
    expect(RENDER_ROLES.upscale).toEqual(['muapi_enhance_upscale', 'muapi_predict_result']);
    expect(RENDER_ROLES.cutout).toEqual(['muapi_enhance_bg_remove', 'muapi_predict_result']);
    expect(RENDER_ROLES.sound).toEqual(['muapi_audio_create', 'muapi_audio_from_text', 'muapi_predict_result']);
    expect(RENDER_ROLES.lipsync).toEqual(['muapi_edit_lipsync', 'muapi_predict_result']);
    expect(RENDER_ROLES.clip).toEqual(['muapi_edit_clipping', 'muapi_predict_result']);
    expect(RENDER_ROLES.poll).toEqual(['muapi_predict_result']);
  });
});

describe('website hero', () => {
  it('writes direction and prompts with no tools', () => {
    const workflow = template('website-hero');
    expect(workflow.nodes.map((node) => node.instructions)).toEqual(
      WEBSITE_HERO_SKILLS.map((path) => expect.stringContaining(path)),
    );
    for (const node of workflow.nodes) {
      expect(node.instructions.startsWith('Follow ')).toBe(true);
      expect(node.mcpToolNames).toEqual([]);
    }
    expect(workflow.edges.map((edge) => [edge.source, edge.target])).toEqual([
      [workflow.nodes[0].id, workflow.nodes[1].id],
      [workflow.nodes[1].id, workflow.nodes[2].id],
    ]);
  });

  it('renders a still and then animates it with the shared roles', () => {
    const workflow = template('website-hero-render');
    const still = nodeNamed(workflow, 'Still');
    const animate = nodeNamed(workflow, 'Animate');
    expect(still.mcpToolNames).toBe(RENDER_ROLES.still);
    expect(animate.mcpToolNames).toBe(RENDER_ROLES.animate);
    expect(still.instructions).toContain(RENDER_SKILL);
    expect(still.instructions).toContain('Role: still');
    expect(animate.instructions).toContain(RENDER_SKILL);
    expect(animate.instructions).toContain('Role: animate');
    expect(workflow.edges).toEqual([
      expect.objectContaining({ source: still.id, target: animate.id }),
    ]);
  });
});

describe('ad workflows', () => {
  it('follows the advertising skill order with no tools', () => {
    const workflow = template('ad-strategy');
    expect(workflow.nodes).toHaveLength(AD_STRATEGY_SKILLS.length);
    workflow.nodes.forEach((node, index) => {
      expect(node.instructions.startsWith('Follow ')).toBe(true);
      expect(node.instructions).toContain(AD_STRATEGY_SKILLS[index]);
      expect(node.mcpToolNames).toEqual([]);
    });
    for (let index = 0; index < workflow.nodes.length - 1; index += 1) {
      expect(workflow.edges[index]).toEqual(
        expect.objectContaining({
          source: workflow.nodes[index].id,
          target: workflow.nodes[index + 1].id,
        }),
      );
    }
  });

  it('reuses still, animate, edit, and sound roles', () => {
    const workflow = template('ad-render');
    const still = nodeNamed(workflow, 'Still');
    const spot = nodeNamed(workflow, 'Spot');
    const crops = ['Crop 1:1', 'Crop 9:16', 'Crop 1.91:1'].map((name) => nodeNamed(workflow, name));
    const music = nodeNamed(workflow, 'Music');
    expect(still.mcpToolNames).toBe(RENDER_ROLES.still);
    expect(spot.mcpToolNames).toBe(RENDER_ROLES.animate);
    for (const crop of crops) expect(crop.mcpToolNames).toBe(RENDER_ROLES.edit);
    expect(music.mcpToolNames).toBe(RENDER_ROLES.sound);
    for (const node of workflow.nodes) {
      expect(node.instructions).toContain(RENDER_SKILL);
      expect(node.instructions).toMatch(/Role: (still|animate|edit|sound)/);
    }
    expect(workflow.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: still.id, target: spot.id }),
        ...crops.map((crop) => expect.objectContaining({ source: still.id, target: crop.id })),
      ]),
    );
    expect(workflow.edges.some((edge) => edge.target === music.id)).toBe(false);
  });
});

describe('media-poll', () => {
  it('polls with the shared poll role', () => {
    const workflow = template('media-poll');
    expect(workflow.nodes).toHaveLength(1);
    expect(workflow.nodes[0].mcpToolNames).toBe(RENDER_ROLES.poll);
    expect(workflow.nodes[0].instructions).toContain(RENDER_SKILL);
    expect(workflow.nodes[0].instructions).toContain('Role: poll');
  });
});

describe('generated packs', () => {
  it('does not include the hand-authored media templates', () => {
    const ids = new Set((packTemplates as { id: string }[]).map((item) => item.id));
    for (const id of ['website-hero', 'website-hero-render', 'ad-strategy', 'ad-render', 'media-poll']) {
      expect(ids.has(id)).toBe(false);
    }
  });
});
