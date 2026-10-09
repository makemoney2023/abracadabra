import type { AgentType, WorkflowTemplate } from '../types';
import { RENDER_ROLES, type RenderRole } from '../mcp/render-roles';

const RENDER_SKILL = '.cursor/skills/community/muapi-render/SKILL.md';

function follow(path: string, note: string): string {
  return `Follow ${path}. ${note}`;
}

function render(role: RenderRole, note: string): string {
  return `Follow ${RENDER_SKILL}\nRole: ${role}\n${note}`;
}

function at(index: number): { x: number; y: number } {
  return { x: 50 + (index % 6) * 280, y: 80 + Math.floor(index / 6) * 200 };
}

function textChain(
  id: string,
  name: string,
  description: string,
  steps: { name: string; type: AgentType; path: string; note: string }[],
): WorkflowTemplate {
  const nodes = steps.map((step, index) => ({
    id: `${id}-${index + 1}`,
    type: step.type,
    name: step.name,
    instructions: follow(step.path, step.note),
    position: at(index),
    mcpToolNames: [] as readonly string[],
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `${id}-e${index + 1}`,
    source: nodes[index].id,
    target: node.id,
  }));
  return { id, name, description, nodes, edges };
}

export const MEDIA_TEMPLATES: WorkflowTemplate[] = [
  textChain(
    'website-hero',
    'Website hero',
    'Write a wide website-hero still and the motion that animates it. No render calls.',
    [
      {
        name: 'Direction',
        type: 'writer',
        path: '.cursor/skills/community/ui-ux-pro-max-skill/banner-design/SKILL.md',
        note: 'Format is a website hero, wide. The page headline stays in HTML. The still leaves clear space for type.',
      },
      {
        name: 'Still prompt',
        type: 'writer',
        path: '.cursor/skills/community/visual-skills/image/SKILL.md',
        note: 'Return one still prompt for that hero.',
      },
      {
        name: 'Motion prompt',
        type: 'writer',
        path: '.cursor/skills/community/visual-skills/video/SKILL.md',
        note: 'Return one motion prompt that moves that still. Slow and loopable.',
      },
    ],
  ),
  {
    id: 'website-hero-render',
    name: 'Website hero render',
    description: 'Render the approved hero still, then animate that still.',
    nodes: [
      {
        id: 'whr-still',
        type: 'publisher',
        name: 'Still',
        instructions: render('still', 'One website-hero still from the approved prompt. Use an image URL when the brief already has one.'),
        position: { x: 50, y: 80 },
        mcpToolNames: RENDER_ROLES.still,
      },
      {
        id: 'whr-animate',
        type: 'publisher',
        name: 'Animate',
        instructions: render('animate', 'Animate the still URL from the previous node with the approved motion prompt. Image-to-video.'),
        position: { x: 360, y: 80 },
        mcpToolNames: RENDER_ROLES.animate,
      },
    ],
    edges: [{ id: 'whr-e1', source: 'whr-still', target: 'whr-animate' }],
  },
  textChain(
    'ad-strategy',
    'Ad strategy',
    'Advertising skills, then one still prompt and one shot prompt. No render calls.',
    [
      { name: 'Avatar', type: 'researcher', path: '.cursor/skills/community/advertising-skills/skills/foundations/avatar-extraction/SKILL.md', note: 'Extract the buyer.' },
      { name: 'Offer', type: 'writer', path: '.cursor/skills/community/advertising-skills/skills/foundations/offer-extraction/SKILL.md', note: 'Extract the offer.' },
      { name: 'Awareness', type: 'writer', path: '.cursor/skills/community/advertising-skills/skills/copy-chief/schwartz-awareness-mapper/SKILL.md', note: 'Map awareness.' },
      { name: 'Mechanism', type: 'writer', path: '.cursor/skills/community/advertising-skills/skills/copy-chief/mechanism-builder/SKILL.md', note: 'Name the mechanism.' },
      { name: 'Angles', type: 'writer', path: '.cursor/skills/community/advertising-skills/skills/operator-os/ad-angle-multiplier/SKILL.md', note: 'Pick one angle and carry it forward.' },
      { name: 'Thumbstop', type: 'writer', path: '.cursor/skills/community/advertising-skills/skills/operator-os/scroll-stopping-creative/SKILL.md', note: 'Write the first three seconds.' },
      { name: 'Path', type: 'writer', path: '.cursor/skills/community/advertising-skills/skills/operator-os/conversion-path-builder/SKILL.md', note: 'Design the path from click to conversion.' },
      { name: 'Objections', type: 'writer', path: '.cursor/skills/community/advertising-skills/skills/copy-chief/objection-crusher/SKILL.md', note: 'Answer the objections.' },
      { name: 'Language', type: 'critic', path: '.cursor/skills/community/advertising-skills/skills/qa/generic-language-killer/SKILL.md', note: 'Remove generic language.' },
      { name: 'Still prompt', type: 'writer', path: '.cursor/skills/community/visual-skills/image/SKILL.md', note: 'Return one still prompt.' },
      { name: 'Shot prompt', type: 'writer', path: '.cursor/skills/community/visual-skills/video/SKILL.md', note: 'Return one shot prompt for that still.' },
    ],
  ),
  {
    id: 'ad-render',
    name: 'Ad render',
    description: 'Render the approved ad still, crops, spot, and music.',
    nodes: [
      {
        id: 'adr-still',
        type: 'publisher',
        name: 'Still',
        instructions: render('still', 'One ad still from the approved prompt. Edit when the brief has an image URL.'),
        position: { x: 50, y: 200 },
        mcpToolNames: RENDER_ROLES.still,
      },
      {
        id: 'adr-spot',
        type: 'publisher',
        name: 'Spot',
        instructions: render('animate', 'Animate the still URL with the approved shot prompt.'),
        position: { x: 360, y: 40 },
        mcpToolNames: RENDER_ROLES.animate,
      },
      {
        id: 'adr-crop-11',
        type: 'publisher',
        name: 'Crop 1:1',
        instructions: render('edit', 'Reframe the still URL to 1:1 for feed and LinkedIn. Keep the subject centered.'),
        position: { x: 360, y: 200 },
        mcpToolNames: RENDER_ROLES.edit,
      },
      {
        id: 'adr-crop-916',
        type: 'publisher',
        name: 'Crop 9:16',
        instructions: render('edit', 'Reframe the still URL to 9:16 for Story and Reels. Keep the subject centered.'),
        position: { x: 360, y: 360 },
        mcpToolNames: RENDER_ROLES.edit,
      },
      {
        id: 'adr-crop-191',
        type: 'publisher',
        name: 'Crop 1.91:1',
        instructions: render('edit', 'Reframe the still URL to 1.91:1, about 1200 by 628. Keep the subject centered.'),
        position: { x: 670, y: 200 },
        mcpToolNames: RENDER_ROLES.edit,
      },
      {
        id: 'adr-music',
        type: 'publisher',
        name: 'Music',
        instructions: render('sound', 'One instrumental bed from the packet tone. Music, not an effect.'),
        position: { x: 50, y: 40 },
        mcpToolNames: RENDER_ROLES.sound,
      },
    ],
    edges: [
      { id: 'adr-e-spot', source: 'adr-still', target: 'adr-spot' },
      { id: 'adr-e-11', source: 'adr-still', target: 'adr-crop-11' },
      { id: 'adr-e-916', source: 'adr-still', target: 'adr-crop-916' },
      { id: 'adr-e-191', source: 'adr-still', target: 'adr-crop-191' },
    ],
  },
  {
    id: 'media-poll',
    name: 'Media poll',
    description: 'Finish a MuAPI request id that was still processing.',
    nodes: [
      {
        id: 'mp-poll',
        type: 'publisher',
        name: 'Poll',
        instructions: render('poll', 'Poll the request id in the brief. Return the CDN URL, or the same id and the latest status.'),
        position: { x: 50, y: 80 },
        mcpToolNames: RENDER_ROLES.poll,
      },
    ],
    edges: [],
  },
];
