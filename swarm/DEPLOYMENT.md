# Agent Swarm Orchestrator — Deployment Guide

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed (`npm install -g wrangler`)
- Cloudflare account with Workers AI enabled
- Node.js 18+

## Quick Deploy

```bash
cd swarm

# 1. Install dependencies (Worker + UI)
npm install
npm --prefix frontend install

# 2. Login to Cloudflare (first time only)
npx wrangler login

# 3. Create the R2 bucket (first time only, per account)
npx wrangler r2 bucket create agent-swarm-artifacts

# 4. Publish skills to the handoff-skills bucket (skill-pack nodes load full SKILL.md from it)
(cd ../handoff && npm run publish:skills)

# 5. Build the UI and deploy everything
npm run deploy
```

## What Gets Deployed

| Resource | Type | Purpose |
|---|---|---|
| `agent-swarm-orchestrator` | Worker | Main application server |
| `WorkflowDO` | Durable Object | Workflow state, execution engine, WebSocket coordinator |
| `agent-swarm-artifacts` | R2 Bucket | Output artifacts storage |
| `handoff-skills` (`SKILLS`) | R2 Bucket (shared with Handoff) | Full skill bodies loaded by skill-pack nodes |
| `AI` | Workers AI Binding | Llama 3.1 8B model access |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ React Flow  │  │  Artifact    │  │  Template │ │
│  │   Canvas    │  │   Viewer     │  │  Selector │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                │                │       │
│         └────────────────┼────────────────┘       │
│                          │ WebSocket              │
└──────────────────────────┼────────────────────────┘
                           │
┌──────────────────────────┼────────────────────────┐
│              Cloudflare Worker                     │
│  ┌───────────────────────┼──────────────────────┐ │
│  │              WorkflowDO                       │ │
│  │  ┌─────────────┐  ┌──────────┐  ┌────────┐  │ │
│  │  │  Workflow   │  │Execution │  │Memory  │  │ │
│  │  │   Store     │  │  Engine  │  │ Store  │  │ │
│  │  └─────────────┘  └────┬─────┘  └────────┘  │ │
│  │                        │                      │ │
│  │                   ┌────┴─────┐                │ │
│  │                   │Workers AI│                │ │
│  │                   │Llama 3.1 │                │ │
│  │                   └──────────┘                │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

## Environment Variables

Workers AI and R2 are bound via `wrangler.toml`. Secrets:

| Secret | Purpose |
|---|---|
| `RESET_TOKEN` | Enables `POST /api/admin/reset`. Without it the endpoint returns 403. |
| `SWARM_RUN_SECRET` | Bearer HQ sends before a run may call the MCP portal. Without it, a `portal` server is dropped. |
| `CF_ACCESS_CLIENT_ID` | Access service token id, added only on an authorized portal call. |
| `CF_ACCESS_CLIENT_SECRET` | Access service token secret, added only on an authorized portal call. |

The Parallel API key is not in this table. It is the bearer on portal server `parallel-search` (`https://search.parallel.ai/mcp`). The portal exposes that server as `parallel-search_web_search` and `parallel-search_web_fetch`, and only researcher nodes receive those tools.

## Wipe All Run Data

```bash
npx wrangler secret put RESET_TOKEN          # once; paste a long random string
curl -X POST https://<worker-host>/api/admin/reset \
  -H "Authorization: Bearer $RESET_TOKEN"
```

The reset clears all Durable Object storage: workflows, executions, memory, and artifact indexes. It also deletes R2 `agent-swarm-artifacts` objects under `artifacts/` and `reports/`. The `handoff-skills` bucket is never touched. Open canvases are disconnected and reconnect to an empty store.

## Customization

### Change AI Model
Edit `src/ai/agents.ts`:
```typescript
const stream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { ... });
```

Other options: `@cf/mistral/mistral-7b-instruct-v0.1`, `@cf/meta/llama-2-7b-chat-int8`

### Add Agent Types
Edit `src/types.ts` — add to `AgentType` union and `AGENT_DEFAULTS` map.

### Add Templates
Edit `src/types.ts` — add to `WORKFLOW_TEMPLATES` array.

## Cost Estimate

| Resource | Free Tier | Expected Usage |
|---|---|---|
| Workers | 100k req/day | ~10 req per workflow run |
| Workers AI | 10k tokens/day | ~2k tokens per agent node |
| Durable Objects | — | Included in Workers |
| R2 | 10GB storage | ~1KB per artifact |

## Troubleshooting

**Workers AI not available in your region?**
- Check [Workers AI availability](https://developers.cloudflare.com/workers-ai/platform/limits/)
- Use a different model or region

**WebSocket connection fails?**
- Ensure you're using `wss://` in production
- Check browser console for CORS errors

**Durable Object not persisting?**
- Run `npx wrangler deploy` to apply migrations
- Check `wrangler.toml` has the `[[migrations]]` section
