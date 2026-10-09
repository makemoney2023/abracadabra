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

const BANNER = '.cursor/skills/community/ui-ux-pro-max-skill/banner-design/SKILL.md';
const BRAND = '.cursor/skills/community/ui-ux-pro-max-skill/brand/SKILL.md';
const IMAGE = '.cursor/skills/community/visual-skills/image/SKILL.md';
const VIDEO = '.cursor/skills/community/visual-skills/video/SKILL.md';

const SKIP_FRAME = 'If this frame is not in the approved pick list, return skipped and do not call a tool.';
const SKIP_AUDIO = 'If the brief has no audio URL, return skipped and do not call a tool.';

function renderGraph(
  id: string,
  name: string,
  description: string,
  nodes: { key: string; name: string; role: RenderRole; note: string }[],
  links: [string, string][],
): WorkflowTemplate {
  return {
    id,
    name,
    description,
    nodes: nodes.map((node, index) => ({
      id: `${id}-${node.key}`,
      type: 'publisher' as const,
      name: node.name,
      instructions: render(node.role, node.note),
      position: at(index),
      mcpToolNames: RENDER_ROLES[node.role],
    })),
    edges: links.map(([source, target], index) => ({
      id: `${id}-e${index + 1}`,
      source: `${id}-${source}`,
      target: `${id}-${target}`,
    })),
  };
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
  textChain('social-pack', 'Social pack', 'Write one still prompt and the social crops. No render calls.', [
    { name: 'Formats', type: 'writer', path: BANNER, note: 'Social formats: 1:1, 4:5, 9:16, and 16:9.' },
    { name: 'Still prompt', type: 'writer', path: IMAGE, note: 'Return one still prompt those crops will reframe.' },
  ]),
  renderGraph('social-pack-render', 'Social pack render', 'Render the still, then the four social crops.', [
    { key: 'still', name: 'Still', role: 'still', note: 'One social still from the approved prompt.' },
    { key: '11', name: 'Edit 1:1', role: 'edit', note: 'Reframe the still URL to 1:1.' },
    { key: '45', name: 'Edit 4:5', role: 'edit', note: 'Reframe the still URL to 4:5.' },
    { key: '916', name: 'Edit 9:16', role: 'edit', note: 'Reframe the still URL to 9:16.' },
    { key: '169', name: 'Edit 16:9', role: 'edit', note: 'Reframe the still URL to 16:9.' },
  ], [
    ['still', '11'],
    ['still', '45'],
    ['still', '916'],
    ['still', '169'],
  ]),
  textChain('blog-header', 'Blog header', 'Write one 1200×628 header prompt. No render calls.', [
    { name: 'Header prompt', type: 'writer', path: IMAGE, note: 'One blog or Open Graph header prompt at 1200×628.' },
  ]),
  renderGraph('blog-header-render', 'Blog header render', 'Render one 1200×628 header still.', [
    { key: 'still', name: 'Still', role: 'still', note: 'One still at 1200×628 for a blog or Open Graph header.' },
  ], []),
  textChain('logo-sting', 'Logo sting', 'Write the mark, the still prompt, and the motion. No render calls.', [
    { name: 'Brand', type: 'writer', path: BRAND, note: 'Define the mark, palette, and where it will be used.' },
    { name: 'Still prompt', type: 'writer', path: IMAGE, note: 'Return one logo still prompt.' },
    { name: 'Motion prompt', type: 'writer', path: VIDEO, note: 'Return one short logo-sting motion prompt.' },
  ]),
  renderGraph('logo-sting-render', 'Logo sting render', 'Render the logo still, then animate it and upscale it.', [
    { key: 'still', name: 'Still', role: 'still', note: 'One logo still from the approved prompt.' },
    { key: 'animate', name: 'Animate', role: 'animate', note: 'Animate the logo still URL into a short sting.' },
    { key: 'upscale', name: 'Upscale', role: 'upscale', note: 'Upscale the logo still URL.' },
  ], [
    ['still', 'animate'],
    ['still', 'upscale'],
  ]),
  textChain('brand-kit', 'Brand kit', 'Write prompts for the mark, the lockup, and the mood board. No render calls.', [
    { name: 'Brand', type: 'writer', path: BRAND, note: 'Define the mark, the dark and light lockup, and the mood.' },
    { name: 'Prompts', type: 'writer', path: IMAGE, note: 'Return three still prompts: mark, dark and light lockup, and mood board.' },
  ]),
  renderGraph('brand-kit-render', 'Brand kit render', 'Render the mark, lockup, and mood board side by side.', [
    { key: 'mark', name: 'Mark', role: 'still', note: 'The mark still from the approved packet.' },
    { key: 'lockup', name: 'Lockup', role: 'still', note: 'The dark and light lockup still from the approved packet.' },
    { key: 'mood', name: 'Mood', role: 'still', note: 'The mood board still from the approved packet.' },
  ], []),
  textChain('page-cutout', 'Page cutout', 'Name what stays in the cutout. No render calls.', [
    { name: 'Subject', type: 'writer', path: IMAGE, note: 'Name what stays in frame for a transparent page asset.' },
  ]),
  renderGraph('page-cutout-render', 'Page cutout render', 'Cut the subject out, then upscale that file.', [
    { key: 'cutout', name: 'Cutout', role: 'cutout', note: 'Remove the background from the image URL in the brief.' },
    { key: 'upscale', name: 'Upscale', role: 'upscale', note: 'Upscale the cutout URL from the previous node.' },
  ], [['cutout', 'upscale']]),
  textChain('product-angles', 'Product angles', 'Write four angle prompts for one product URL. No render calls.', [
    { name: 'Angles', type: 'writer', path: IMAGE, note: 'Four prompts: front, side, 45 degrees, and top. All keep the product URL.' },
  ]),
  renderGraph('product-angles-render', 'Product angles render', 'Edit one product URL into four angles.', [
    { key: 'front', name: 'Front', role: 'edit', note: 'Front view of the product URL in the brief.' },
    { key: 'side', name: 'Side', role: 'edit', note: 'Side view of the product URL in the brief.' },
    { key: '45', name: 'Angle 45', role: 'edit', note: '45 degree view of the product URL in the brief.' },
    { key: 'top', name: 'Top', role: 'edit', note: 'Top view of the product URL in the brief.' },
  ], []),
  textChain('launch-set', 'Launch set', 'Write the hero, the motion, and the social crops. No render calls.', [
    { name: 'Direction', type: 'writer', path: BANNER, note: 'Website hero plus social crops at 1:1, 4:5, 9:16, and 16:9.' },
    { name: 'Still prompt', type: 'writer', path: IMAGE, note: 'Return one hero still prompt.' },
    { name: 'Motion prompt', type: 'writer', path: VIDEO, note: 'Return one motion prompt for that still.' },
  ]),
  renderGraph('launch-set-render', 'Launch set render', 'Render the hero, social crops, motion, and music.', [
    { key: 'still', name: 'Still', role: 'still', note: 'One launch still from the approved prompt.' },
    { key: 'animate', name: 'Animate', role: 'animate', note: 'Animate the still URL with the approved motion prompt.' },
    { key: '11', name: 'Edit 1:1', role: 'edit', note: 'Reframe the still URL to 1:1.' },
    { key: '45', name: 'Edit 4:5', role: 'edit', note: 'Reframe the still URL to 4:5.' },
    { key: '916', name: 'Edit 9:16', role: 'edit', note: 'Reframe the still URL to 9:16.' },
    { key: '169', name: 'Edit 16:9', role: 'edit', note: 'Reframe the still URL to 16:9.' },
    { key: 'music', name: 'Music', role: 'sound', note: 'One instrumental bed from the packet tone. Music, not an effect.' },
  ], [
    ['still', 'animate'],
    ['still', '11'],
    ['still', '45'],
    ['still', '916'],
    ['still', '169'],
  ]),
  textChain('amazon-listing', 'Amazon listing', 'Write four listing prompts. No render calls.', [
    { name: 'Frames', type: 'writer', path: IMAGE, note: 'Four prompts: hero, lifestyle, infographic, and detail. Use the product URL when the brief has one.' },
  ]),
  renderGraph('amazon-listing-render', 'Amazon listing render', 'Render the four listing stills side by side.', [
    { key: 'hero', name: 'Hero', role: 'still', note: 'Hero still. Use the product URL when the brief has one.' },
    { key: 'life', name: 'Lifestyle', role: 'still', note: 'Lifestyle still. Use the product URL when the brief has one.' },
    { key: 'info', name: 'Infographic', role: 'still', note: 'Infographic still. Use the product URL when the brief has one.' },
    { key: 'detail', name: 'Detail', role: 'still', note: 'Detail still. Use the product URL when the brief has one.' },
  ], []),
  textChain('storyboard', 'Storyboard', 'Write four frames and one prompt each. No render calls.', [
    { name: 'Frames', type: 'writer', path: VIDEO, note: 'A four-frame storyboard. Name Frame 1 through Frame 4.' },
    { name: 'Prompts', type: 'writer', path: IMAGE, note: 'One still prompt for each of the four frames.' },
  ]),
  renderGraph('storyboard-render', 'Storyboard render', 'Render four storyboard stills. Do not animate them.', [
    { key: 'f1', name: 'Frame 1', role: 'still', note: 'Still for Frame 1.' },
    { key: 'f2', name: 'Frame 2', role: 'still', note: 'Still for Frame 2.' },
    { key: 'f3', name: 'Frame 3', role: 'still', note: 'Still for Frame 3.' },
    { key: 'f4', name: 'Frame 4', role: 'still', note: 'Still for Frame 4.' },
  ], []),
  renderGraph('storyboard-animate', 'Storyboard animate', 'Animate only the frames staff picked.', [
    { key: 'f1', name: 'Frame 1', role: 'animate', note: `Animate the Frame 1 still URL. ${SKIP_FRAME}` },
    { key: 'f2', name: 'Frame 2', role: 'animate', note: `Animate the Frame 2 still URL. ${SKIP_FRAME}` },
    { key: 'f3', name: 'Frame 3', role: 'animate', note: `Animate the Frame 3 still URL. ${SKIP_FRAME}` },
    { key: 'f4', name: 'Frame 4', role: 'animate', note: `Animate the Frame 4 still URL. ${SKIP_FRAME}` },
  ], []),
  textChain('ugc-spot', 'UGC spot', 'Write the composite and the motion. No render calls.', [
    { name: 'Composite prompt', type: 'writer', path: IMAGE, note: 'One prompt that places the person URL with the product URL.' },
    { name: 'Motion prompt', type: 'writer', path: VIDEO, note: 'One motion prompt for that composite.' },
  ]),
  renderGraph('ugc-spot-render', 'UGC spot render', 'Composite the person and product, animate it, then lipsync when audio exists.', [
    { key: 'composite', name: 'Composite', role: 'edit', note: 'Edit the person URL and the product URL into one frame.' },
    { key: 'animate', name: 'Animate', role: 'animate', note: 'Animate the composite URL.' },
    { key: 'lipsync', name: 'Lipsync', role: 'lipsync', note: `Lipsync the clip to the audio URL. ${SKIP_AUDIO}` },
  ], [
    ['composite', 'animate'],
    ['animate', 'lipsync'],
  ]),
  textChain('spokesperson', 'Spokesperson', 'Write the portrait prompt and the motion. No render calls.', [
    { name: 'Portrait prompt', type: 'writer', path: IMAGE, note: 'One spokesperson still prompt.' },
    { name: 'Motion prompt', type: 'writer', path: VIDEO, note: 'One motion prompt for that portrait.' },
  ]),
  renderGraph('spokesperson-render', 'Spokesperson render', 'Render the portrait, animate it, lipsync it, and add music.', [
    { key: 'still', name: 'Still', role: 'still', note: 'One spokesperson still.' },
    { key: 'animate', name: 'Animate', role: 'animate', note: 'Animate the still URL.' },
    { key: 'lipsync', name: 'Lipsync', role: 'lipsync', note: 'Lipsync the clip to the audio URL in the brief.' },
    { key: 'music', name: 'Music', role: 'sound', note: 'One instrumental bed. Music, not an effect.' },
  ], [
    ['still', 'animate'],
    ['animate', 'lipsync'],
  ]),
  textChain('highlight-clips', 'Highlight clips', 'Name the moments to keep. No render calls.', [
    { name: 'Moments', type: 'writer', path: VIDEO, note: 'Name the moments to keep from the long video URL.' },
  ]),
  renderGraph('highlight-clips-render', 'Highlight clips render', 'Cut highlights from one long video URL.', [
    { key: 'clip', name: 'Clip', role: 'clip', note: 'Cut highlights from the long video URL in the brief.' },
  ], []),
];
