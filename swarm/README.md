# Agent Swarm Orchestrator

A visual multi-agent workflow builder for Cloudflare Workers. Drag-and-drop agents onto a canvas, connect them into pipelines, and watch them execute live with token-by-token streaming.

## Features

- **Visual Canvas** — Drag-and-drop agent nodes with React Flow
- **6 Agent Types** — Researcher, Writer, Editor, Publisher, Critic, Summarizer
- **Parallel Execution** — Branches run concurrently with topological scheduling
- **Live Streaming** — WebSocket-powered token-by-token output
- **Agent Memory** — Agents remember context across executions
- **Artifact Viewer** — Side panel showing all node outputs
- **Template Workflows** — 8 pre-built pipelines (Blog Post, Research Report, Content Critique, Parallel Research, Support Triage, Code Review Squad, Startup Pitch Validator, Fact-Check Desk) plus skill-pack chains generated from related skill folders. A second template chains to the right. Regenerate packs from `handoff/` with `npx tsx scripts/write-pack-templates.ts`.
- **Full Skill Execution** — When a node's instructions reference a `SKILL.md`, the worker loads the full skill body from the `handoff-skills` R2 bucket (`SKILLS` binding) and instructs the agent to execute every step and produce the skill's deliverables. Each node is allowed 4096 output tokens and up to 16,000 characters. Every downstream node also receives the original brief. If a referenced skill isn't published, the node fails with a clear error and does not fall back to a generic prompt.
- **Finalized PDF Reports** — Cover page, run-summary stat cards, results table, full per-agent outputs, execution timeline, and quality checks; backed up to R2
- **MCP Tool Access** — Connect remote MCP servers (Streamable HTTP) via the Plug button; agents call tools in a Reason → Act → Observe loop, with per-agent server selection and live tool badges on the canvas

## MCP Servers

Agents can call tools on any remote MCP server that speaks Streamable HTTP:

1. Click the **Plug** button in the header → **Add server** (name + `https://…/mcp` URL) → **Test URL** to list its tools.
2. Nodes use all configured servers by default; restrict per-agent in the **Selected agent** panel.
3. Templates show which server types they work best with (e.g. Fact-Check Desk → web-search + fetch MCPs).
4. Tool calls stream live over WebSockets, appear as wrench badges on nodes, and are recorded in the PDF report (`via MCP: server/tool`).

No external server handy? Point one at this worker's built-in demo at `/demo-mcp/mcp` (`get_time`, `echo`, `word_count`) to try the loop with zero setup.
- **Cloudflare Native** — Workers AI, Durable Objects, WebSockets, R2. Deploys to the Abracadabra account, with Handoff and HQ.

## Changelog

- **2026-10-09** — Skill-pack nodes now run their full skills.
  - **Why:** campaigns came out generic ("Transform Your Idea") with no platform specs or character-limit checks. Nodes only saw a skill path and a short description, Workers AI capped output at 256 tokens, the system prompt said "be concise", ad-creative was typed as a critic, and downstream nodes lost the brief.
  - **Touchpoints:** `src/ai/skills.ts`, `src/ai/agents.ts`, `src/do/WorkflowDO.ts`, `src/index.ts`, `wrangler.toml`, `handoff/src/lib/pack-templates.ts`, `src/pack-templates.json`.
  - **Deploy:** publish skills first (`cd handoff && npm run publish:skills`).
  - **Verification:** `npm test` and `npx tsc --noEmit` in `swarm/`; the full handoff vitest suites.

## Quick Start

```bash
npm install
npm --prefix frontend install

# Build the UI, then start the Worker (serves frontend/dist + API)
npm run build:ui
npm run dev
```

Open http://localhost:8787

## Deploy

```bash
npm run deploy   # builds the UI, then deploys Worker + static assets
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full guide.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/new-york components, React Flow 11, Lucide icons |
| Backend | Cloudflare Workers |
| State | Durable Objects |
| AI | Workers AI (Llama 3.1 8B FP8, GLM fallbacks) |
| Realtime | WebSockets |
| Storage | R2 |

## Project Structure

```
agent-swarm-orchestrator/
├── frontend/               # Vite + React + Tailwind + shadcn UI
│   ├── src/
│   │   ├── App.tsx         # Main app (canvas, sidebar, dialogs)
│   │   ├── main.tsx
│   │   ├── index.css       # Tailwind + shadcn theme tokens
│   │   ├── lib/            # cn() utils, agent metadata
│   │   └── components/
│   │       ├── AgentNode.tsx
│   │       ├── ArtifactPanel.tsx
│   │       └── ui/         # shadcn primitives (button, card, dialog, ...)
│   └── dist/               # Build output, served as Worker static assets
├── src/
│   ├── index.ts          # Worker entry (API routing + static assets)
│   ├── types.ts          # Shared types + templates
│   ├── ai/
│   │   └── agents.ts     # Workers AI integration
│   └── do/
│       └── WorkflowDO.ts # Durable Object (state + execution)
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## License

MIT
