import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { openHandoffDb } from "@/db/open";
import { localObjectBytesEnabled, openObjectStore } from "@/lib/store/objects";
import { pingClamd, scanInstream } from "./clamd";
import { claimUploadedFile, scanClaimedFile } from "./jobs/scan";

/** Production refuses to run without clamd, and refuses to mark unscanned files clean. */
export async function workerBoot(input: {
  nodeEnv: string;
  allowUnscanned: string | undefined;
  ping: () => Promise<boolean>;
}): Promise<number> {
  if (input.nodeEnv === "production" && input.allowUnscanned === "1") return 1;
  if (input.nodeEnv === "production" && !(await input.ping())) return 1;
  return 0;
}

/** Health is the only request this process serves. */
export function startHealthServer(port: number, ping: () => Promise<boolean>): Promise<Server> {
  const server = createServer((request, response) => {
    const path = request.url?.split("?")[0];
    if (request.method !== "GET" || path !== "/health") {
      response.writeHead(404);
      response.end();
      return;
    }
    void ping()
      .then((ok) => {
        response.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
        response.end(JSON.stringify({ clamd: ok }));
      })
      .catch(() => {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ clamd: false }));
      });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const code = await workerBoot({
    nodeEnv: process.env.NODE_ENV ?? "development",
    allowUnscanned: process.env.HANDOFF_ALLOW_UNSCANNED,
    ping: pingClamd,
  });
  if (code !== 0) process.exit(code);
  const port = Number(process.env.PORT || 8080);
  await startHealthServer(port, pingClamd);
  const allowUnscanned = process.env.NODE_ENV !== "production" && process.env.HANDOFF_ALLOW_UNSCANNED === "1";
  for (;;) {
    if (!localObjectBytesEnabled() && !process.env.HANDOFF_OBJECT_PATH) {
      await sleep(5_000);
      continue;
    }
    const sql = await openHandoffDb();
    const claimed = await claimUploadedFile(sql, Date.now());
    if (!claimed) {
      await sleep(1_000);
      continue;
    }
    await scanClaimedFile({
      sql,
      store: openObjectStore(),
      file: claimed,
      now: Date.now(),
      allowUnscanned,
      scanBytes: scanInstream,
    });
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
