import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

type QueueMessage = { body: unknown; ack(): void; retry(): void };

export default {
  fetch: handler.fetch,
  async queue(batch: { messages: QueueMessage[] }) {
    for (const message of batch.messages) {
      message.ack();
    }
  },
};

export { DOQueueHandler, DOShardedTagCache };
