export type AgentType = 'researcher' | 'writer' | 'editor' | 'publisher' | 'critic' | 'summarizer';

export interface AgentNode {
  id: string;
  type: AgentType;
  name: string;
  instructions: string;
  position: { x: number; y: number };
  /** Workflow-level server IDs this node may call. Undefined = all workflow servers. Empty = none. */
  mcpServerIds?: string[];
  /** Servers attached directly to this node (independent of workflow servers). */
  mcpServers?: McpServerConfig[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
}

/** Suggested external data for a template (labels only — user supplies URLs). */
export interface SuggestedMcp {
  label: string;
  why: string;
}

export interface AgentEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  createdAt: number;
  /** Remote MCP servers available to this workflow's agents. */
  mcpServers?: McpServerConfig[];
}

export type NodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  toolsUsed?: { server: string; tool: string }[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  input: string;
  status: 'running' | 'completed' | 'failed';
  results: Record<string, NodeResult>;
  startedAt: number;
  finishedAt?: number;
}

export interface WSMessage {
  type: 'node_start' | 'node_output' | 'node_done' | 'node_error' | 'workflow_complete' | 'workflow_error' | 'node_tool';
  executionId: string;
  nodeId?: string;
  output?: string;
  error?: string;
  timestamp: number;
  /** Present for node_tool messages. */
  phase?: 'call' | 'result';
  server?: string;
  tool?: string;
  summary?: string;
}

export interface AgentMemory {
  agentType: AgentType;
  entries: MemoryEntry[];
}

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: number;
  executionId: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  suggestedMcp?: SuggestedMcp[];
}

export interface Artifact {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  content: string;
  timestamp: number;
}

const DEFAULT_INSTRUCTIONS: Record<AgentType, string> = {
  researcher: 'Research the given topic thoroughly. Provide key facts, data points, and context. Be comprehensive but concise.',
  writer: 'Write clear, engaging content based on the input. Adapt tone and style to the target audience.',
  editor: 'Review and improve the content. Fix grammar, improve clarity, and ensure consistency. Return the polished version.',
  publisher: 'Format the final content for publication. Add structure, headings, and any final touches.',
  critic: 'Critically analyze the content. Identify weaknesses, gaps, and areas for improvement. Be constructive but thorough.',
  summarizer: 'Summarize the key points concisely. Capture the essential information without losing important details.',
};

export const AGENT_DEFAULTS: Record<AgentType, { name: string; instructions: string; color: string }> = {
  researcher: {
    name: 'Researcher',
    instructions: DEFAULT_INSTRUCTIONS.researcher,
    color: '#3B82F6',
  },
  writer: {
    name: 'Writer',
    instructions: DEFAULT_INSTRUCTIONS.writer,
    color: '#8B5CF6',
  },
  editor: {
    name: 'Editor',
    instructions: DEFAULT_INSTRUCTIONS.editor,
    color: '#F59E0B',
  },
  publisher: {
    name: 'Publisher',
    instructions: DEFAULT_INSTRUCTIONS.publisher,
    color: '#10B981',
  },
  critic: {
    name: 'Critic',
    instructions: DEFAULT_INSTRUCTIONS.critic,
    color: '#EF4444',
  },
  summarizer: {
    name: 'Summarizer',
    instructions: DEFAULT_INSTRUCTIONS.summarizer,
    color: '#06B6D4',
  },
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'blog-post',
    name: 'Blog Post Generator',
    description: 'Research → Write → Edit → Publish a complete blog post',
    nodes: [
      { id: 't1-researcher', type: 'researcher', name: 'Researcher', instructions: DEFAULT_INSTRUCTIONS.researcher, position: { x: 50, y: 100 } },
      { id: 't1-writer', type: 'writer', name: 'Writer', instructions: DEFAULT_INSTRUCTIONS.writer, position: { x: 350, y: 100 } },
      { id: 't1-editor', type: 'editor', name: 'Editor', instructions: DEFAULT_INSTRUCTIONS.editor, position: { x: 650, y: 100 } },
      { id: 't1-publisher', type: 'publisher', name: 'Publisher', instructions: DEFAULT_INSTRUCTIONS.publisher, position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't1-e1', source: 't1-researcher', target: 't1-writer' },
      { id: 't1-e2', source: 't1-writer', target: 't1-editor' },
      { id: 't1-e3', source: 't1-editor', target: 't1-publisher' },
    ],
  },
  {
    id: 'research-report',
    name: 'Research Report',
    description: 'Research → Summarize → Write → Edit a detailed report',
    nodes: [
      { id: 't2-researcher', type: 'researcher', name: 'Researcher', instructions: DEFAULT_INSTRUCTIONS.researcher, position: { x: 50, y: 100 } },
      { id: 't2-summarizer', type: 'summarizer', name: 'Summarizer', instructions: DEFAULT_INSTRUCTIONS.summarizer, position: { x: 350, y: 100 } },
      { id: 't2-writer', type: 'writer', name: 'Report Writer', instructions: 'Write a detailed, well-structured report based on the research summary.', position: { x: 650, y: 100 } },
      { id: 't2-editor', type: 'editor', name: 'Editor', instructions: DEFAULT_INSTRUCTIONS.editor, position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't2-e1', source: 't2-researcher', target: 't2-summarizer' },
      { id: 't2-e2', source: 't2-summarizer', target: 't2-writer' },
      { id: 't2-e3', source: 't2-writer', target: 't2-editor' },
    ],
  },
  {
    id: 'content-critique',
    name: 'Content Critique & Improve',
    description: 'Write → Critique → Edit → Publish with quality assurance',
    nodes: [
      { id: 't3-writer', type: 'writer', name: 'Writer', instructions: DEFAULT_INSTRUCTIONS.writer, position: { x: 50, y: 100 } },
      { id: 't3-critic', type: 'critic', name: 'Critic', instructions: DEFAULT_INSTRUCTIONS.critic, position: { x: 350, y: 100 } },
      { id: 't3-editor', type: 'editor', name: 'Editor', instructions: 'Address all the critic\'s feedback and produce a final polished version.', position: { x: 650, y: 100 } },
      { id: 't3-publisher', type: 'publisher', name: 'Publisher', instructions: DEFAULT_INSTRUCTIONS.publisher, position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't3-e1', source: 't3-writer', target: 't3-critic' },
      { id: 't3-e2', source: 't3-critic', target: 't3-editor' },
      { id: 't3-e3', source: 't3-editor', target: 't3-publisher' },
    ],
  },
  {
    id: 'parallel-research',
    name: 'Parallel Research Merge',
    description: 'Multiple researchers work in parallel, then merge results',
    nodes: [
      { id: 't4-r1', type: 'researcher', name: 'Tech Researcher', instructions: 'Research the technical aspects, architecture, and implementation details.', position: { x: 50, y: 50 } },
      { id: 't4-r2', type: 'researcher', name: 'Market Researcher', instructions: 'Research the market landscape, competitors, and business implications.', position: { x: 50, y: 200 } },
      { id: 't4-r3', type: 'researcher', name: 'User Researcher', instructions: 'Research user needs, pain points, and UX considerations.', position: { x: 50, y: 350 } },
      { id: 't4-summarizer', type: 'summarizer', name: 'Merge & Summarize', instructions: 'Combine all research into a unified summary. Identify overlaps and unique insights.', position: { x: 400, y: 200 } },
      { id: 't4-writer', type: 'writer', name: 'Writer', instructions: 'Write a comprehensive report based on the merged research.', position: { x: 700, y: 200 } },
    ],
    edges: [
      { id: 't4-e1', source: 't4-r1', target: 't4-summarizer' },
      { id: 't4-e2', source: 't4-r2', target: 't4-summarizer' },
      { id: 't4-e3', source: 't4-r3', target: 't4-summarizer' },
      { id: 't4-e4', source: 't4-summarizer', target: 't4-writer' },
    ],
  },
  {
    id: 'support-triage',
    name: 'Support Triage & Reply',
    description: 'Hackathon CX track: thread → triage → drafted reply. Summarize → Critique → Write → Publish',
    suggestedMcp: [
      { label: 'Ticketing MCP (e.g. Zendesk, Intercom)', why: 'Pull the live thread, customer tier, and history instead of pasting text.' },
      { label: 'Knowledge-base MCP', why: 'Ground the drafted reply in current help-center articles.' },
    ],
    nodes: [
      { id: 't5-sum', type: 'summarizer', name: 'Thread Summarizer', instructions: 'Distill the support thread to: customer intent, urgency (P0-P3), sentiment, and the exact ask. Output 5 bullets max.', position: { x: 50, y: 100 } },
      { id: 't5-critic', type: 'critic', name: 'Policy Checker', instructions: 'Check the summary against support policy: what can we promise, what needs escalation, what info is missing? List risks and blockers.', position: { x: 350, y: 100 } },
      { id: 't5-writer', type: 'writer', name: 'Reply Drafter', instructions: 'Draft a warm, concise customer reply that answers the ask, sets expectations, and requests any missing info. No internal notes.', position: { x: 650, y: 100 } },
      { id: 't5-pub', type: 'publisher', name: 'Ticket Publisher', instructions: 'Format the final ticket: TL;DR, priority, suggested macro, drafted reply, and next action for the agent. Use clear headings.', position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't5-e1', source: 't5-sum', target: 't5-critic' },
      { id: 't5-e2', source: 't5-critic', target: 't5-writer' },
      { id: 't5-e3', source: 't5-writer', target: 't5-pub' },
    ],
  },
  {
    id: 'code-review',
    name: 'Code Review Squad',
    description: 'Hackathon dev-tool track: understand → red-team → fix → checklist',
    suggestedMcp: [
      { label: 'Git hosting MCP (e.g. GitHub)', why: 'Fetch the PR diff, files, and CI status directly by PR number.' },
      { label: 'Docs MCP', why: 'Check API usage against current library docs while reviewing.' },
    ],
    nodes: [
      { id: 't6-res', type: 'researcher', name: 'Code Reader', instructions: 'Explain what the pasted code/diff does: entry points, data flow, dependencies. Keep it to 6 bullets so reviewers have context.', position: { x: 50, y: 100 } },
      { id: 't6-critic', type: 'critic', name: 'Bug Hunter', instructions: 'Red-team the code for bugs, security issues (injection, auth, secrets), perf traps, and edge cases. Rank findings P0-P2 with line hints.', position: { x: 350, y: 100 } },
      { id: 't6-editor', type: 'editor', name: 'Fix Proposer', instructions: 'For each P0/P1 finding, propose a minimal concrete fix with a short before/after snippet. Skip style nits.', position: { x: 650, y: 100 } },
      { id: 't6-sum', type: 'summarizer', name: 'Action Checklist', instructions: 'Merge everything into a ship checklist: must-fix, should-fix, tests to add. End with an Approve / Request-changes verdict.', position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't6-e1', source: 't6-res', target: 't6-critic' },
      { id: 't6-e2', source: 't6-critic', target: 't6-editor' },
      { id: 't6-e3', source: 't6-editor', target: 't6-sum' },
    ],
  },
  {
    id: 'startup-validator',
    name: 'Startup Pitch Validator',
    description: 'Hackathon startup track: 3 parallel researchers → red-team → pitch',
    suggestedMcp: [
      { label: 'Web search MCP', why: 'Live market sizing, competitor pricing, and news for the researchers.' },
      { label: 'Docs MCP', why: 'Verify Cloudflare architecture claims for the feasibility brief.' },
    ],
    nodes: [
      { id: 't7-mkt', type: 'researcher', name: 'Market Researcher', instructions: 'Size the market for the idea: ICP, competitors, pricing comps, wedge. 5 bullets with numbers where possible.', position: { x: 50, y: 50 } },
      { id: 't7-tech', type: 'researcher', name: 'Tech Feasibility', instructions: 'Assess build feasibility on Cloudflare (Workers, AI, DO, R2): architecture sketch, hardest part, effort estimate.', position: { x: 50, y: 200 } },
      { id: 't7-risk', type: 'researcher', name: 'Risk Researcher', instructions: 'List top risks: technical, legal, GTM, moat. For each, one mitigation. Be blunt.', position: { x: 50, y: 350 } },
      { id: 't7-critic', type: 'critic', name: 'Red Team', instructions: 'Steel-man the case AGAINST this startup using the three research briefs. Kill the hype: 5 reasons it fails.', position: { x: 400, y: 200 } },
      { id: 't7-writer', type: 'writer', name: 'Pitch Writer', instructions: 'Write a 150-word hackathon pitch that survives the red-team: problem, solution, why-now, demo plan, ask. End with a one-line verdict: Build / Pivot / Kill.', position: { x: 700, y: 200 } },
    ],
    edges: [
      { id: 't7-e1', source: 't7-mkt', target: 't7-critic' },
      { id: 't7-e2', source: 't7-tech', target: 't7-critic' },
      { id: 't7-e3', source: 't7-risk', target: 't7-critic' },
      { id: 't7-e4', source: 't7-critic', target: 't7-writer' },
    ],
  },
  {
    id: 'fact-check',
    name: 'Fact-Check Desk',
    description: 'Hackathon trust track: research → verify → correct → publish with sources',
    suggestedMcp: [
      { label: 'Web search MCP', why: 'Verify claims against live sources instead of model memory.' },
      { label: 'Fetch MCP', why: 'Pull full page content for the URLs the researcher cites.' },
    ],
    nodes: [
      { id: 't8-res', type: 'researcher', name: 'Claim Extractor', instructions: 'Extract every factual claim from the input as a numbered list. Separate facts from opinions.', position: { x: 50, y: 100 } },
      { id: 't8-critic', type: 'critic', name: 'Verifier', instructions: 'Verify each claim: Supported / Disputed / Unverifiable. Flag hallucinations, stale stats, and missing context. Be strict.', position: { x: 350, y: 100 } },
      { id: 't8-editor', type: 'editor', name: 'Corrector', instructions: 'Rewrite the original content with corrections inline. Keep the author voice, fix only what the verifier flagged.', position: { x: 650, y: 100 } },
      { id: 't8-pub', type: 'publisher', name: 'Cited Publisher', instructions: 'Publish the final: corrected text, then a Sources & confidence section listing each claim verdict. End with an overall trust score out of 10.', position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't8-e1', source: 't8-res', target: 't8-critic' },
      { id: 't8-e2', source: 't8-critic', target: 't8-editor' },
      { id: 't8-e3', source: 't8-editor', target: 't8-pub' },
    ],
  },
  {
    id: 'pack-schema-readiness',
    name: 'Schema readiness',
    description: 'Check AI readiness from the site schema, then keep the scraped pages as client context.',
    nodes: [
      { id: 'schema-r', type: 'researcher', name: 'Schema readiness', instructions: 'Score AI readiness from the site schema. Name the JSON-LD types, the missing schema, and the score. Five bullets.', position: { x: 50, y: 120 } },
      { id: 'schema-w', type: 'writer', name: 'Readiness note', instructions: 'Write a fit note from that score. Say what the schema already answers and the first gap a buyer would notice.', position: { x: 360, y: 120 } },
    ],
    edges: [
      { id: 'schema-e1', source: 'schema-r', target: 'schema-w' },
    ],
  },
];
