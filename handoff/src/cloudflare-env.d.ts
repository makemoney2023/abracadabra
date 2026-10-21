// Project env fields. `wrangler types` regenerates src/agent/env.d.ts; this declaration merges with it.
declare namespace Cloudflare {
  interface Env {
    /** "1", "true", or "on" lets assigned agents prepare and execute social plans. Absent or anything else keeps writes off. */
    SOCIAL_AGENT_ACTIONS?: string;
    /** "1", "true", or "on" lets staff and client owners create read-only view links. Absent or anything else hides creation. */
    LIBRARY_VIEW_LINKS?: string;
    /** "1", "true", or "on" lets staff save an article as a local social draft. Absent or anything else hides that button. */
    ARTICLE_SOCIAL_PROMO?: string;
    /** HMAC pepper for view-link unlock attempts. Worker secret. Never send this to the browser. */
    HANDOFF_SHARE_HASH_PEPPER?: string;
  }
}
