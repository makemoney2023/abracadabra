type ClosablePart = { type: string; state?: string };
type ClosableMessage = { role: string; parts: ClosablePart[] };

/**
 * A tool approval continues the same assistant message. The chat agent drops
 * the next `text-start` when the previous text part is still `streaming`, and
 * the browser then rejects the following `text-delta`. Closing those parts
 * lets the continuation open a new text part.
 */
export function closeDanglingStreamParts(messages: ClosableMessage[]): void {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if ((part.type === "text" || part.type === "reasoning") && part.state === "streaming") {
        part.state = "done";
      }
    }
  }
}

/** Yield only complete SSE lines. A split `text-start` line is otherwise parsed as invalid JSON and dropped. */
export function rechunkSse(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  return new ReadableStream({
    async start(controller) {
      reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.length > 0) controller.enqueue(encoder.encode(buffer.endsWith("\n") ? buffer : `${buffer}\n`));
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const newline = buffer.lastIndexOf("\n");
          if (newline === -1) continue;
          controller.enqueue(encoder.encode(buffer.slice(0, newline + 1)));
          buffer = buffer.slice(newline + 1);
        }
      } catch (error) {
        try {
          controller.error(error);
        } catch {
          // The chat agent already cancelled this body.
        }
      }
    },
    cancel() {
      return reader?.cancel();
    },
  });
}

export function rechunkSseResponse(response: Response): Response {
  if (!response.body) return response;
  return new Response(rechunkSse(response.body), {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}
