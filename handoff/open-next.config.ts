import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// R2 is not enabled on this account, so the incremental cache stays the dummy
// implementation. Do not add NEXT_INC_CACHE_R2_BUCKET until a bucket exists.
export default defineCloudflareConfig();
