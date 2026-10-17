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

const BANNER = '.cursor/skills/community/ui-ux-pro-max-skill/banner-design/SKILL.md';
const BRAND = '.cursor/skills/community/ui-ux-pro-max-skill/brand/SKILL.md';
const IMAGE = '.cursor/skills/community/visual-skills/image/SKILL.md';
const VIDEO = '.cursor/skills/community/visual-skills/video/SKILL.md';

const CATALOG_IDS = [
  'social-pack',
  'social-pack-render',
  'blog-header',
  'blog-header-render',
  'logo-sting',
  'logo-sting-render',
  'brand-kit',
  'brand-kit-render',
  'page-cutout',
  'page-cutout-render',
  'product-angles',
  'product-angles-render',
  'launch-set',
  'launch-set-render',
  'amazon-listing',
  'amazon-listing-render',
  'storyboard',
  'storyboard-render',
  'storyboard-animate',
  'ugc-spot',
  'ugc-spot-render',
  'spokesperson',
  'spokesperson-render',
  'highlight-clips',
  'highlight-clips-render',
];

function expectTextSkills(id: string, skills: string[]) {
  const workflow = template(id);
  expect(workflow.nodes).toHaveLength(skills.length);
  workflow.nodes.forEach((node, index) => {
    expect(node.instructions.startsWith('Follow ')).toBe(true);
    expect(node.instructions).toContain(skills[index]);
    expect(node.mcpToolNames).toEqual([]);
  });
  for (let index = 0; index < workflow.nodes.length - 1; index += 1) {
    expect(workflow.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: workflow.nodes[index].id,
          target: workflow.nodes[index + 1].id,
        }),
      ]),
    );
  }
}

function expectRole(id: string, name: string, role: keyof typeof RENDER_ROLES) {
  const node = nodeNamed(template(id), name);
  expect(node.mcpToolNames).toBe(RENDER_ROLES[role]);
  expect(node.instructions).toContain(RENDER_SKILL);
  expect(node.instructions).toContain(`Role: ${role}`);
  return node;
}

function expectEdges(id: string, pairs: [string, string][]) {
  const workflow = template(id);
  const byName = new Map(workflow.nodes.map((node) => [node.name, node.id]));
  expect(workflow.edges).toEqual(
    pairs.map(([source, target]) =>
      expect.objectContaining({ source: byName.get(source), target: byName.get(target) }),
    ),
  );
}

function expectNoIncoming(id: string, names: string[]) {
  const workflow = template(id);
  const ids = new Set(names.map((name) => nodeNamed(workflow, name).id));
  expect(workflow.edges.some((edge) => ids.has(edge.target))).toBe(false);
}

describe('pack catalog', () => {
  it('writes social, blog, logo, and brand text with no tools', () => {
    expectTextSkills('social-pack', [BANNER, IMAGE]);
    expectTextSkills('blog-header', [IMAGE]);
    expectTextSkills('logo-sting', [BRAND, IMAGE, VIDEO]);
    expectTextSkills('brand-kit', [BRAND, IMAGE]);
    expectTextSkills('page-cutout', [IMAGE]);
    expectTextSkills('product-angles', [IMAGE]);
    expectTextSkills('launch-set', [BANNER, IMAGE, VIDEO]);
    expectTextSkills('amazon-listing', [IMAGE]);
    expectTextSkills('storyboard', [VIDEO, IMAGE]);
    expectTextSkills('ugc-spot', [IMAGE, VIDEO]);
    expectTextSkills('spokesperson', [IMAGE, VIDEO]);
    expectTextSkills('highlight-clips', [VIDEO]);
  });

  it('renders each pack from the shared roles', () => {
    const socialEdits = ['Edit 1:1', 'Edit 4:5', 'Edit 9:16', 'Edit 16:9'] as const;
    expectRole('social-pack-render', 'Still', 'still');
    for (const name of socialEdits) expectRole('social-pack-render', name, 'edit');
    expectEdges('social-pack-render', socialEdits.map((name) => ['Still', name]));

    const blog = expectRole('blog-header-render', 'Still', 'still');
    expect(blog.instructions).toContain('1200×628');
    expect(template('blog-header-render').edges).toEqual([]);

    expectRole('logo-sting-render', 'Still', 'still');
    expectRole('logo-sting-render', 'Animate', 'animate');
    expectRole('logo-sting-render', 'Upscale', 'upscale');
    expectEdges('logo-sting-render', [
      ['Still', 'Animate'],
      ['Still', 'Upscale'],
    ]);

    for (const name of ['Mark', 'Lockup', 'Mood']) expectRole('brand-kit-render', name, 'still');
    expect(template('brand-kit-render').edges).toEqual([]);

    expectRole('page-cutout-render', 'Cutout', 'cutout');
    expectRole('page-cutout-render', 'Upscale', 'upscale');
    expectEdges('page-cutout-render', [['Cutout', 'Upscale']]);

    for (const name of ['Front', 'Side', 'Angle 45', 'Top']) expectRole('product-angles-render', name, 'edit');
    expect(template('product-angles-render').edges).toEqual([]);

    expectRole('launch-set-render', 'Still', 'still');
    expectRole('launch-set-render', 'Animate', 'animate');
    expectRole('launch-set-render', 'Music', 'sound');
    for (const name of socialEdits) expectRole('launch-set-render', name, 'edit');
    expectEdges('launch-set-render', [
      ['Still', 'Animate'],
      ...socialEdits.map((name) => ['Still', name] as [string, string]),
    ]);
    expectNoIncoming('launch-set-render', ['Music']);

    for (const name of ['Hero', 'Lifestyle', 'Infographic', 'Detail']) {
      expectRole('amazon-listing-render', name, 'still');
    }
    expect(template('amazon-listing-render').edges).toEqual([]);

    for (const name of ['Frame 1', 'Frame 2', 'Frame 3', 'Frame 4']) {
      expectRole('storyboard-render', name, 'still');
      const animate = expectRole('storyboard-animate', name, 'animate');
      expect(animate.instructions).toContain('skipped');
      expect(animate.instructions.toLowerCase()).toContain('do not call a tool');
    }
    expect(template('storyboard-render').edges).toEqual([]);
    expect(template('storyboard-animate').edges).toEqual([]);

    expectRole('ugc-spot-render', 'Composite', 'edit');
    expectRole('ugc-spot-render', 'Animate', 'animate');
    const lipsync = expectRole('ugc-spot-render', 'Lipsync', 'lipsync');
    expect(lipsync.instructions).toContain('skipped');
    expect(lipsync.instructions.toLowerCase()).toContain('do not call a tool');
    expect(lipsync.instructions.toLowerCase()).toContain('audio');
    expectEdges('ugc-spot-render', [
      ['Composite', 'Animate'],
      ['Animate', 'Lipsync'],
    ]);

    expectRole('spokesperson-render', 'Still', 'still');
    expectRole('spokesperson-render', 'Animate', 'animate');
    expectRole('spokesperson-render', 'Lipsync', 'lipsync');
    expectRole('spokesperson-render', 'Music', 'sound');
    expectEdges('spokesperson-render', [
      ['Still', 'Animate'],
      ['Animate', 'Lipsync'],
    ]);
    expectNoIncoming('spokesperson-render', ['Music']);

    expectRole('highlight-clips-render', 'Clip', 'clip');
    expect(template('highlight-clips-render').edges).toEqual([]);
  });
});

describe('generated packs', () => {
  it('does not include the hand-authored media templates', () => {
    const ids = new Set((packTemplates as { id: string }[]).map((item) => item.id));
    for (const id of ['website-hero', 'website-hero-render', 'ad-strategy', 'ad-render', 'media-poll', ...CATALOG_IDS]) {
      expect(ids.has(id)).toBe(false);
    }
  });
});
