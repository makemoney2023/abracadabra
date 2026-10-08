import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

type QueueMessage = { body: unknown; ack(): void; retry(): void };

type QueueEnv = {
  WORKER_SELF_REFERENCE?: { fetch(input: string, init?: RequestInit): Promise<Response> };
  CLOUDFLARE_API_TOKEN?: string;
};

export default {
  fetch: handler.fetch,
  async queue(batch: { messages: QueueMessage[] }, env: QueueEnv) {
    const worker = env.WORKER_SELF_REFERENCE;
    const token = env.CLOUDFLARE_API_TOKEN ?? "";
    for (const message of batch.messages) {
      if (!worker || !token) {
        message.retry();
        continue;
      }
      try {
        const response = await worker.fetch("https://check.abra-ca-dabra.app/api/internal/jobs", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-job-token": token,
          },
          body: JSON.stringify(message.body),
        });
        if (response.ok || response.status === 400) message.ack();
        else message.retry();
      } catch {
        message.retry();
      }
    }
  },
};

export { DOQueueHandler, DOShardedTagCache };
