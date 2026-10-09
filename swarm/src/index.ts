import { WorkflowDO } from './do/WorkflowDO';
import { handleDemoMcp } from './mcp/demo';
import { uiAssetKey, uiContentType } from './ui-asset';

export { WorkflowDO };

export interface Env {
  AI: any;
  WORKFLOW_DO: DurableObjectNamespace;
  ARTIFACTS: R2Bucket;
  /** Published skill bodies (handoff `npm run publish:skills`), keyed skills/<path>/SKILL.md. */
  SKILLS: R2Bucket;
  ASSETS: Fetcher;
  /** Enables POST /api/admin/reset when set (wrangler secret). */
  RESET_TOKEN?: string;
  /** Required before a run may call the MCP portal. */
  SWARM_RUN_SECRET?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

const frameAncestors =
  "frame-ancestors https://hq.abra-ca-dabra.app https://handoff-hq.abracadabra-ai.workers.dev http://hq.localhost:3000 http://localhost:3000";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Self-hosted demo MCP server (zero-setup tool testing)
    if (url.pathname === '/demo-mcp/mcp') {
      return handleDemoMcp(request);
    }

    // Durable Object routing for the API (live execution, state, memory, artifacts)
    if (url.pathname.startsWith('/api/')) {
      const id = env.WORKFLOW_DO.idFromName('orchestrator');
      const stub = env.WORKFLOW_DO.get(id);
      const doUrl = new URL(request.url);
      doUrl.pathname = doUrl.pathname.replace('/api', '');
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // A published canvas build in R2 wins, so the allowlist field ships without a Wrangler asset session.
    if (request.method === 'GET' || request.method === 'HEAD') {
      const uiKey = uiAssetKey(url.pathname);
      if (uiKey) {
        const object = await env.ARTIFACTS.get(uiKey);
        if (object) {
          const headers = new Headers();
          headers.set('content-type', object.httpMetadata?.contentType || uiContentType(uiKey));
          headers.set('Content-Security-Policy', frameAncestors);
          if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
          return new Response(object.body, { status: 200, headers });
        }
      }
    }

    // Static frontend. HQ embeds this page, so only those hosts may frame it.
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set("Content-Security-Policy", frameAncestors);
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};
