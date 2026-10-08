import type { Workflow, WorkflowExecution } from '../types';

/**
 * Sample data for testing the PDF builder locally without running a swarm.
 * Covers: markdown bullets, headings, long output, error node, empty node.
 */
export function sampleWorkflow(): Workflow {
  return {
    id: 'wf-sample-hackathon',
    name: 'Startup Pitch Validator — Edge Agents',
    nodes: [
      { id: 'mkt', type: 'researcher', name: 'Market Researcher', instructions: '', position: { x: 50, y: 50 } },
      { id: 'tech', type: 'researcher', name: 'Tech Feasibility', instructions: '', position: { x: 50, y: 200 } },
      { id: 'risk', type: 'researcher', name: 'Risk Researcher', instructions: '', position: { x: 50, y: 350 } },
      { id: 'critic', type: 'critic', name: 'Red Team', instructions: '', position: { x: 400, y: 200 } },
      { id: 'pitch', type: 'writer', name: 'Pitch Writer', instructions: '', position: { x: 700, y: 200 } },
    ],
    edges: [
      { id: 'e1', source: 'mkt', target: 'critic' },
      { id: 'e2', source: 'tech', target: 'critic' },
      { id: 'e3', source: 'risk', target: 'critic' },
      { id: 'e4', source: 'critic', target: 'pitch' },
    ],
    createdAt: Date.now(),
  };
}

export function sampleExecution(workflowId: string): WorkflowExecution {
  const t0 = Date.now() - 92_000;
  return {
    id: 'ex-sample-12345678',
    workflowId,
    input:
      'Validate my hackathon idea: a visual multi-agent swarm builder on Cloudflare where non-technical founders drag agents onto a canvas and export investor-ready PDF reports.',
    status: 'completed',
    startedAt: t0,
    finishedAt: t0 + 84_500,
    results: {
      mkt: {
        nodeId: 'mkt',
        status: 'done',
        startedAt: t0,
        finishedAt: t0 + 18_200,
        output: `## Market findings\n\n- **ICP:** non-technical founders + hackathon teams who need a demo in under 10 minutes\n- **Competitors:** Langflow, Flowise, Dust — none are Cloudflare-native or export print-ready reports\n- **Pricing comps:** $20-49/seat/mo; report export is a proven upsell\n- **Wedge:** "canvas to boardroom" — the PDF is the viral loop\n\nThe fastest path is hackathon demos and template gallery sharing.`,
      },
      tech: {
        nodeId: 'tech',
        status: 'done',
        startedAt: t0,
        finishedAt: t0 + 24_600,
        output: `## Feasibility\n\n- Workers + Durable Objects handle topological execution and WS fan-out cleanly\n- Workers AI (Llama 3.1 8B FP8) is enough per-node; add GLM fallback for spikes\n- R2 backs up artifacts/*.json and reports/*.pdf for durability\n- Hardest part: keeping the WS UI in sync on reconnect — add heartbeat + resync`,
      },
      risk: {
        nodeId: 'risk',
        status: 'error',
        startedAt: t0 + 1000,
        finishedAt: t0 + 9000,
        output: '',
        error: 'Model timeout after 2 retries (simulated for sample output)',
      },
      critic: {
        nodeId: 'critic',
        status: 'done',
        startedAt: t0 + 25_000,
        finishedAt: t0 + 61_000,
        output: `## Why it fails\n\n1. Demo magic hides evals — judges will ask for accuracy numbers\n2. Report quality varies with model temperature\n3. Multi-branch costs balloon without per-node budgets\n4. No auth story for team workspaces yet\n5. PDF typography is the moat — it must look board-ready every time`,
      },
      pitch: {
        nodeId: 'pitch',
        status: 'done',
        startedAt: t0 + 61_500,
        finishedAt: t0 + 84_500,
        output: `## Pitch\n\n**Problem:** founders can't demo agent ideas without code.\n**Solution:** drag agents, connect edges, hit Execute — watch tokens stream, export a board-ready PDF.\n**Why now:** Agents Week shipped memory + observability primitives; this is the demo layer.\n**Demo plan:** live canvas → run support-triage template → download PDF in under 90 seconds.\n\n**Verdict: Build.**`,
      },
    },
  };
}
