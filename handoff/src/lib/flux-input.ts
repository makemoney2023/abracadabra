/**
 * Multipart input for the Workers AI Flux 2 models (`flux-2-dev`, `flux-2-klein-9b`). They reject a JSON prompt.
 * Cloudflare's documented binding call passes the serialized form as a stream plus its boundary-aware Content-Type.
 */
export function fluxInput(prompt: string): { multipart: { body: ReadableStream<Uint8Array>; contentType: string } } {
  const form = new FormData();
  form.set("prompt", prompt);
  form.set("width", "1024");
  form.set("height", "1024");
  const response = new Response(form);
  const contentType = response.headers.get("content-type") ?? "";
  return { multipart: { body: response.body as ReadableStream<Uint8Array>, contentType } };
}
