import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@jsquash/webp", "fast-png"],
};

export default nextConfig;

void initOpenNextCloudflareForDev();
