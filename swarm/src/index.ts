import { WorkflowDO } from './do/WorkflowDO';
import { handleDemoMcp } from './mcp/demo';

export { WorkflowDO };

export interface Env {
  AI: any;
  WORKFLOW_DO: DurableObjectNamespace;
  ARTIFACTS: R2Bucket;
  ASSETS: Fetcher;
}

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

    // Static frontend. HQ embeds this page, so only those hosts may frame it.
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set(
      "Content-Security-Policy",
      "frame-ancestors https://hq.abra-ca-dabra.app https://handoff-hq.abracadabra-ai.workers.dev http://hq.localhost:3000 http://localhost:3000",
    );
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};
