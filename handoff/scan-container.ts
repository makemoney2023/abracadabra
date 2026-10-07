import { Container, ContainerProxy } from "@cloudflare/containers";
import type { D1Like } from "./src/db/sql";
import type { FilesBucket } from "./src/lib/store/objects";
import { handleDatabaseRequest, handleObjectRequest } from "./src/scan/bindings";

export { ContainerProxy };

type ScanEnv = {
  DB: D1Like;
  FILES: FilesBucket;
  SCAN_CONTAINER: {
    getByName(name: string): { fetch(input: string): Promise<Response> };
  };
};

/** One ClamAV process. A ping every two minutes keeps it awake. */
export class ScanContainer extends Container<ScanEnv> {
  defaultPort = 8080;
  sleepAfter = "10m";
  enableInternet = true;
  envVars = {
    NODE_ENV: "production",
    PORT: "8080",
    HANDOFF_D1_ORIGIN: "http://handoff.d1",
    HANDOFF_R2_ORIGIN: "http://handoff.r2",
  };
}

// Assignment calls the setter. A class field would hide it and never register the hosts.
ScanContainer.outboundByHost = {
  "handoff.d1": (request: Request, env: ScanEnv) => handleDatabaseRequest(request, env.DB),
  "handoff.r2": (request: Request, env: ScanEnv) => handleObjectRequest(request, env.FILES),
};

const scanWorker = {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },
  async scheduled(_event: unknown, env: ScanEnv): Promise<void> {
    await env.SCAN_CONTAINER.getByName("scan").fetch("http://scan/health");
  },
};

export default scanWorker;
