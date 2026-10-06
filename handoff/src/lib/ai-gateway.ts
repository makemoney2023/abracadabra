const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
export const CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export type Understander = {
  summarize(fileName: string, text: string): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
};

type GatewayFetch = (url: string, init?: RequestInit) => Promise<Response>;

type AiBinding = {
  run(model: string, input: unknown, options?: { gateway?: { id: string } }): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asVectors(value: unknown): number[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const vectors: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || !row.every((item) => typeof item === "number")) return null;
    vectors.push(row);
  }
  return vectors;
}

/** Workers AI REST wraps embeddings in result.data. The binding may return data directly. */
export function embedFromGatewayBody(body: unknown): number[][] {
  if (!isRecord(body)) return [];
  const nested = isRecord(body.result) ? asVectors(body.result.data) : null;
  return nested ?? asVectors(body.data) ?? [];
}

/** Chat completions use choices. The Workers AI binding often returns response. */
export function summaryFromChatBody(body: unknown): string {
  if (!isRecord(body)) return "";
  if (typeof body.response === "string") return body.response.trim();
  if (Array.isArray(body.choices)) {
    const first = body.choices[0];
    if (isRecord(first) && isRecord(first.message) && typeof first.message.content === "string") {
      return first.message.content.trim();
    }
  }
  if (isRecord(body.result) && typeof body.result.response === "string") {
    return body.result.response.trim();
  }
  return "";
}

function chatUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
}

function embedUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBED_MODEL}`;
}

/** REST calls for a local run. Production uses the AI binding instead of an API token. */
export function gatewayUnderstander(input: {
  accountId: string;
  token: string;
  gatewayId: string;
  fetchImpl?: GatewayFetch;
}): Understander {
  const call = input.fetchImpl ?? fetch;
  const headers = {
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
    "cf-aig-gateway-id": input.gatewayId,
  };

  return {
    async summarize(fileName, text) {
      const response = await call(chatUrl(input.accountId), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            {
              role: "system",
              content: "Write a short note about this file in plain words. Mention the file name.",
            },
            { role: "user", content: `File: ${fileName}\n\n${text.slice(0, 12_000)}` },
          ],
        }),
      });
      if (!response.ok) throw new Error("The reading service did not answer.");
      const summary = summaryFromChatBody(await response.json());
      if (!summary) throw new Error("The reading service sent an empty note.");
      return summary;
    },
    async embed(texts) {
      const response = await call(embedUrl(input.accountId), {
        method: "POST",
        headers,
        body: JSON.stringify({ text: texts }),
      });
      if (!response.ok) throw new Error("The reading service did not answer.");
      const vectors = embedFromGatewayBody(await response.json());
      if (vectors.length !== texts.length) throw new Error("The reading service sent a bad vector.");
      return vectors;
    },
  };
}

function bindingUnderstander(ai: AiBinding, gatewayId: string): Understander {
  const options = { gateway: { id: gatewayId } };
  return {
    async summarize(fileName, text) {
      const body = await ai.run(
        CHAT_MODEL,
        {
          messages: [
            {
              role: "system",
              content: "Write a short note about this file in plain words. Mention the file name.",
            },
            { role: "user", content: `File: ${fileName}\n\n${text.slice(0, 12_000)}` },
          ],
        },
        options,
      );
      const summary = summaryFromChatBody(body);
      if (!summary) throw new Error("The reading service sent an empty note.");
      return summary;
    },
    async embed(texts) {
      const body = await ai.run(EMBED_MODEL, { text: texts }, options);
      const vectors = embedFromGatewayBody(body);
      if (vectors.length !== texts.length) throw new Error("The reading service sent a bad vector.");
      return vectors;
    },
  };
}

function boundAi(): AiBinding | undefined {
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: { AI?: AiBinding } };
  };
  return holder[CLOUDFLARE_CONTEXT]?.env?.AI;
}

/**
 * Worker AI binding when present. A local run can use the account token.
 * Unit tests stay offline even if the shell has a token.
 */
export function understanderFromRuntime(): Understander | null {
  if (process.env.VITEST) return null;
  const gatewayId = process.env.HANDOFF_AI_GATEWAY_ID?.trim() || "default";
  const ai = boundAi();
  if (ai) return bindingUnderstander(ai, gatewayId);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  if (!accountId || !token) return null;
  return gatewayUnderstander({ accountId, token, gatewayId });
}
