import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Client files use the FILES binding on bucket `handoff`. The incremental cache
// stays the dummy implementation so Next's cache does not share that bucket.
// Do not set NEXT_INC_CACHE_R2_BUCKET.
export default defineCloudflareConfig();
