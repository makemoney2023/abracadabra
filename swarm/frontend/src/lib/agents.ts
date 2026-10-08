export type AgentType =
  | 'researcher'
  | 'writer'
  | 'editor'
  | 'publisher'
  | 'critic'
  | 'summarizer';

export type NodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface Artifact {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  content: string;
  timestamp: number;
}

export interface TemplateMeta {
  id: string;
  name: string;
  desc: string;
  mcpHint?: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
}

export const AGENT_META: Record<
  AgentType,
  { name: string; color: string; icon: string; instructions: string }
> = {
  researcher: {
    name: 'Researcher',
    color: '#3B82F6',
    icon: 'Search',
    instructions:
      'Research the given topic thoroughly. Provide key facts, data points, and context.',
  },
  writer: {
    name: 'Writer',
    color: '#8B5CF6',
    icon: 'PenLine',
    instructions:
      'Write clear, engaging content based on the input. Adapt tone and style to the target audience.',
  },
  editor: {
    name: 'Editor',
    color: '#F59E0B',
    icon: 'FileEdit',
    instructions:
      'Review and improve the content. Fix grammar, improve clarity, and ensure consistency.',
  },
  publisher: {
    name: 'Publisher',
    color: '#10B981',
    icon: 'Megaphone',
    instructions:
      'Format the final content for publication. Add structure, headings, and final touches.',
  },
  critic: {
    name: 'Critic',
    color: '#EF4444',
    icon: 'ScanSearch',
    instructions:
      'Critically analyze the content. Identify weaknesses, gaps, and areas for improvement.',
  },
  summarizer: {
    name: 'Summarizer',
    color: '#06B6D4',
    icon: 'ListCollapse',
    instructions:
      'Summarize the key points concisely. Capture the essential information.',
  },
};

export const TEMPLATES: TemplateMeta[] = [
  { id: 'blog-post', name: 'Blog Post Generator', desc: 'Research → Write → Edit → Publish' },
  { id: 'research-report', name: 'Research Report', desc: 'Research → Summarize → Write → Edit' },
  { id: 'content-critique', name: 'Content Critique', desc: 'Write → Critique → Edit → Publish' },
  { id: 'parallel-research', name: 'Parallel Research', desc: '3 Researchers → Merge → Write' },
  { id: 'support-triage', name: 'Support Triage & Reply', desc: 'Summarize → Check → Reply → Ticket', mcpHint: 'Works best with a ticketing MCP + knowledge-base MCP.' },
  { id: 'code-review', name: 'Code Review Squad', desc: 'Read → Hunt bugs → Fix → Checklist', mcpHint: 'Works best with a git-hosting MCP + docs MCP.' },
  { id: 'startup-validator', name: 'Startup Pitch Validator', desc: '3 Researchers → Red-team → Pitch', mcpHint: 'Works best with a web-search MCP + docs MCP.' },
  { id: 'fact-check', name: 'Fact-Check Desk', desc: 'Extract → Verify → Correct → Cite', mcpHint: 'Works best with a web-search MCP + fetch MCP.' },
];

export interface AgentPreset {
  id: string;
  agentType: AgentType;
  name: string;
  instructions: string;
}

export interface PresetGroup {
  templateId: string;
  templateName: string;
  presets: AgentPreset[];
}

/** Pre-configured specialist roles from the hackathon-track templates.
 *  Keep instructions in sync with WORKFLOW_TEMPLATES in src/types.ts. */
export const PRESET_GROUPS: PresetGroup[] = [
  {
    templateId: 'support-triage',
    templateName: 'Support Triage',
    presets: [
      {
        id: 'thread-summarizer',
        agentType: 'summarizer',
        name: 'Thread Summarizer',
        instructions:
          'Distill the support thread to: customer intent, urgency (P0-P3), sentiment, and the exact ask. Output 5 bullets max.',
      },
      {
        id: 'policy-checker',
        agentType: 'critic',
        name: 'Policy Checker',
        instructions:
          'Check the summary against support policy: what can we promise, what needs escalation, what info is missing? List risks and blockers.',
      },
      {
        id: 'reply-drafter',
        agentType: 'writer',
        name: 'Reply Drafter',
        instructions:
          'Draft a warm, concise customer reply that answers the ask, sets expectations, and requests any missing info. No internal notes.',
      },
      {
        id: 'ticket-publisher',
        agentType: 'publisher',
        name: 'Ticket Publisher',
        instructions:
          'Format the final ticket: TL;DR, priority, suggested macro, drafted reply, and next action for the agent. Use clear headings.',
      },
    ],
  },
  {
    templateId: 'code-review',
    templateName: 'Code Review',
    presets: [
      {
        id: 'code-reader',
        agentType: 'researcher',
        name: 'Code Reader',
        instructions:
          'Explain what the pasted code/diff does: entry points, data flow, dependencies. Keep it to 6 bullets so reviewers have context.',
      },
      {
        id: 'bug-hunter',
        agentType: 'critic',
        name: 'Bug Hunter',
        instructions:
          'Red-team the code for bugs, security issues (injection, auth, secrets), perf traps, and edge cases. Rank findings P0-P2 with line hints.',
      },
      {
        id: 'fix-proposer',
        agentType: 'editor',
        name: 'Fix Proposer',
        instructions:
          'For each P0/P1 finding, propose a minimal concrete fix with a short before/after snippet. Skip style nits.',
      },
      {
        id: 'action-checklist',
        agentType: 'summarizer',
        name: 'Action Checklist',
        instructions:
          'Merge everything into a ship checklist: must-fix, should-fix, tests to add. End with an Approve / Request-changes verdict.',
      },
    ],
  },
  {
    templateId: 'startup-validator',
    templateName: 'Pitch Validator',
    presets: [
      {
        id: 'market-researcher',
        agentType: 'researcher',
        name: 'Market Researcher',
        instructions:
          'Size the market for the idea: ICP, competitors, pricing comps, wedge. 5 bullets with numbers where possible.',
      },
      {
        id: 'tech-feasibility',
        agentType: 'researcher',
        name: 'Tech Feasibility',
        instructions:
          'Assess build feasibility on Cloudflare (Workers, AI, DO, R2): architecture sketch, hardest part, effort estimate.',
      },
      {
        id: 'risk-researcher',
        agentType: 'researcher',
        name: 'Risk Researcher',
        instructions: 'List top risks: technical, legal, GTM, moat. For each, one mitigation. Be blunt.',
      },
      {
        id: 'red-team',
        agentType: 'critic',
        name: 'Red Team',
        instructions:
          'Steel-man the case AGAINST this startup using the three research briefs. Kill the hype: 5 reasons it fails.',
      },
      {
        id: 'pitch-writer',
        agentType: 'writer',
        name: 'Pitch Writer',
        instructions:
          'Write a 150-word hackathon pitch that survives the red-team: problem, solution, why-now, demo plan, ask. End with a one-line verdict: Build / Pivot / Kill.',
      },
    ],
  },
  {
    templateId: 'fact-check',
    templateName: 'Fact-Check',
    presets: [
      {
        id: 'claim-extractor',
        agentType: 'researcher',
        name: 'Claim Extractor',
        instructions:
          'Extract every factual claim from the input as a numbered list. Separate facts from opinions.',
      },
      {
        id: 'verifier',
        agentType: 'critic',
        name: 'Verifier',
        instructions:
          'Verify each claim: Supported / Disputed / Unverifiable. Flag hallucinations, stale stats, and missing context. Be strict.',
      },
      {
        id: 'corrector',
        agentType: 'editor',
        name: 'Corrector',
        instructions:
          'Rewrite the original content with corrections inline. Keep the author voice, fix only what the verifier flagged.',
      },
      {
        id: 'cited-publisher',
        agentType: 'publisher',
        name: 'Cited Publisher',
        instructions:
          'Publish the final: corrected text, then a Sources & confidence section listing each claim verdict. End with an overall trust score out of 10.',
      },
    ],
  },
];
