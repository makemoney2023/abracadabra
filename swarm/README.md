# Agent Swarm Orchestrator

A visual multi-agent workflow builder for Cloudflare Workers. Drag-and-drop agents onto a canvas, connect them into pipelines, and watch them execute live with token-by-token streaming.

## Features

- **Visual Canvas** — Drag-and-drop agent nodes with React Flow. `?executionId=` opens that stored run: nodes, edges, input, results, and artifacts. A run that is still `running` reconnects to the same websocket. Completed and failed runs stay still. Execute starts a new run.

- **6 Agent Types** — Researcher, Writer, Editor, Publisher, Critic, Summarizer
- **Parallel Execution** — Branches run concurrently with topological scheduling
- **Live Streaming** — WebSocket-powered token-by-token output
- **Agent Memory** — Each step remembers its own last two outputs from earlier runs of the *same* workflow (keyed `workflowId:nodeId`), passed as reference only, so concepts never leak between clients or workflows
- **Admin Reset** — `POST /api/admin/reset` with `Authorization: Bearer $RESET_TOKEN` wipes all workflows, runs, memory, and artifacts (Durable Object storage plus R2 `artifacts/` and `reports/`). Published skills are kept. The endpoint returns 403 unless the `RESET_TOKEN` secret is set.
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

HQ-started runs may include a server with id `portal`. The worker adds `CF-Access-Client-Id` and `CF-Access-Client-Secret` for that server only when the execute request sends `Authorization: Bearer $SWARM_RUN_SECRET`. A request without that bearer drops the portal server before any tool call. Set `SWARM_RUN_SECRET`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` with `wrangler secret put`. They are not written into workflow storage.
- **Cloudflare Native** — Workers AI, Durable Objects, WebSockets, R2. Deploys to the Abracadabra account, with Handoff and HQ.

## Changelog

- **2026-10-09** — The MuAPI plan now includes the full pack catalog.
  - **Why:** Social, brand, product, storyboard, UGC, spokesperson, and highlight clips should be templates on the roles that already exist.
  - **Touchpoints:** `docs/superpowers/plans/2026-10-09-muapi-swarm.md` Task 8, `docs/superpowers/specs/2026-10-09-muapi-swarm-design.md` pack catalog, `README.md`.
  - **Data flow:** No runtime change. Those templates are not in the worker yet.
  - **API / schema:** none.
  - **Verification:** Docs only. No tests run.

- **2026-10-09** — Render nodes can call a shared MuAPI role, and the canvas ships website-hero and ad workflows.
  - **Why:** Stills and motion should be one portal server. A website hero is a still, then an animation of that still. An ad uses those same roles.
  - **Touchpoints:** `src/mcp/tool-allow.ts`, `src/mcp/render-roles.ts`, `src/templates/media-templates.ts`, `src/do/WorkflowDO.ts`, `frontend/src/lib/workflow-payload.mjs`, `.cursor/skills/community/muapi-render/SKILL.md`.
  - **Data flow:** A node with `mcpToolNames: []` gets no tools. A non-empty list is the only tools passed to the model, and a missing name fails the node before the model runs. Render nodes get 8 tool rounds. HQ still copies the template JSON, so the allowlist survives a staff run.
  - **API / schema:** Template nodes may include `mcpToolNames`. No Worker secret for the MuAPI key.
  - **Verification:** `npm test` in `swarm/` — 43 passed. `npx tsc --noEmit` in `swarm/` exited 0. `node --test frontend/src/lib/workflow-payload.test.mjs` — 2 passed. `npm run publish:skills` was not run: `handoff/.env.local` has no R2 credentials. The portal server is not linked.

- **2026-10-09** — The MuAPI spec is a general render kit. Ads are one workflow. A website hero that is then animated is another. Both use the same portal server and the same node roles.
  - **Why:** A later job should add a template, not a new MCP server.
  - **Touchpoints:** `docs/superpowers/specs/2026-10-09-muapi-swarm-design.md`, `docs/superpowers/plans/2026-10-09-muapi-swarm.md`, `README.md`, `docs/hq-agent-spec.md`.
  - **Data flow:** No runtime change. The server `muapi` is not linked yet.
  - **API / schema:** none yet.
  - **Verification:** Docs only. No tests run.

- **2026-10-09** — Spec and plan for MuAPI stills, video, and ads through the Cloudflare MCP portal.
  - **Why:** The swarm writes ad strategy. MuAPI renders it. The API key belongs on the portal, with an allowlist, so HQ `/mcp` can turn the server on and off.
  - **Touchpoints:** `docs/superpowers/specs/2026-10-09-muapi-swarm-design.md`, `docs/superpowers/plans/2026-10-09-muapi-swarm.md`, `docs/hq-agent-spec.md` section 2.4, `README.md`.
  - **Data flow:** No runtime change. The server `muapi` is not linked yet. Strategy nodes will take no tools. Each render node will submit once and poll.
  - **API / schema:** none yet. The plan adds `mcpToolNames` on a swarm node when it is built.
  - **Verification:** Docs only. No tests run.

- **2026-10-09** — The canvas opens a stored swarm execution from `?executionId=`.
  - **Why:** HQ links need the worker canvas to show the run that was saved, including a live socket when that run is still going.
  - **Touchpoints:** `frontend/src/lib/execution-link.mjs`, `frontend/src/App.tsx`.
  - **Data flow:** `GET /api/status`, `GET /api/get`, `GET /api/artifacts`, and `/api/ws` only when status is `running`. A missing run toasts and leaves the board empty. Execute still starts a new run.
  - **API / schema:** none.
  - **Verification:** `node --test frontend/src/lib/execution-link.test.mjs` and `npm test` in `swarm/`.
- **2026-10-09** — Memory is scoped per workflow step, and there is a token-guarded full reset.
  - **Why:** memory was keyed by agent type across every client and workflow. Each node got the last three outputs from any run, so old generic concepts kept coming back.
  - **Touchpoints:** `src/ai/memory.ts`, `src/admin/reset.ts`, `src/do/WorkflowDO.ts`, `src/types.ts`, `src/index.ts`, `frontend/src/components/AgentNode.tsx` (memory badge removed).
  - **API:** `GET`/`DELETE /api/memory` removed; `POST /api/admin/reset` added.
  - **Data flow:** existing memory under the old keys is ignored. Run the reset to purge it.
  - **Verification:** `npm test` and `npx tsc --noEmit` in `swarm/`.
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
