import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@jsquash/webp", "fast-png"],
};

export default nextConfig;

// The Space smoke test (scripts/smoke-spaces.ts) runs `next start` against a local SQLite file with no Cloudflare
// account, so it turns the local Workers emulation off. Never set this in a real environment.
if (process.env.HANDOFF_SMOKE_NO_CLOUDFLARE !== "1") void initOpenNextCloudflareForDev();
