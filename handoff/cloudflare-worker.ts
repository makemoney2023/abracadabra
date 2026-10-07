import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
import { d1Sql, type D1Like } from "./src/db/sql";
import { wakeDueAgents, type WakeEnv } from "./src/lib/agent-wake";
import { dispatchQueue } from "./src/lib/queue-dispatch";

type QueueEnv = WakeEnv & {
  DB: D1Like;
};

export default {
  fetch: handler.fetch,
  async queue(batch: { queue: string; messages: { body: unknown; ack(): void; retry(): void }[] }, env: QueueEnv) {
    await dispatchQueue(batch, env);
  },
  async scheduled(event: { cron: string }, env: QueueEnv) {
    await wakeDueAgents(d1Sql(env.DB), env, event.cron, Date.now());
  },
};

export { DOQueueHandler, DOShardedTagCache };
