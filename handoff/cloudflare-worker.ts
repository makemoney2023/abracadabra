import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
import { handleLeadIntakeBatch, type IntakeQueueMessage } from "./src/lib/intake/queue";
import type { D1Like } from "./src/db/sql";

type IntakeEnv = {
  DB: D1Like;
};

export default {
  fetch: handler.fetch,
  async queue(batch: { messages: IntakeQueueMessage[] }, env: IntakeEnv) {
    await handleLeadIntakeBatch(batch.messages, env.DB);
  },
};

export { DOQueueHandler, DOShardedTagCache };
