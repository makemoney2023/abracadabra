import type { NextConfig } from "next";
import { stageRedirects } from "./src/lib/assessment/stage-redirects";

const nextConfig: NextConfig = {
  async redirects() {
    return stageRedirects();
  },
};

export default nextConfig;
