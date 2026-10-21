// Project env fields. `wrangler types` regenerates src/agent/env.d.ts; this declaration merges with it.
declare namespace Cloudflare {
  interface Env {
    /** "1", "true", or "on" lets assigned agents prepare and execute social plans. Absent or anything else keeps writes off. */
    SOCIAL_AGENT_ACTIONS?: string;
  }
}
