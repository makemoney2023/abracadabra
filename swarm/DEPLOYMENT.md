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

# 4. Build the UI and deploy everything
npm run deploy
```

## What Gets Deployed

| Resource | Type | Purpose |
|---|---|---|
| `agent-swarm-orchestrator` | Worker | Main application server |
| `WorkflowDO` | Durable Object | Workflow state, execution engine, WebSocket coordinator |
| `agent-swarm-artifacts` | R2 Bucket | Output artifacts storage |
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

No secrets needed — Workers AI and R2 are bound via `wrangler.toml`.

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
