import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
import type { D1Like } from "./src/db/sql";
import { dispatchQueue } from "./src/lib/queue-dispatch";

type QueueEnv = {
  DB: D1Like;
};

export default {
  fetch: handler.fetch,
  async queue(batch: { queue: string; messages: { body: unknown; ack(): void; retry(): void }[] }, env: QueueEnv) {
    await dispatchQueue(batch, env);
  },
};

export { DOQueueHandler, DOShardedTagCache };
