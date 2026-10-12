/** Multipart body for `@cf/black-forest-labs/flux-2-klein-9b`. The model rejects a JSON prompt. */
export async function fluxInput(prompt: string): Promise<{ multipart: { body: ArrayBuffer; contentType: string } }> {
  const form = new FormData();
  form.set("prompt", prompt);
  form.set("width", "1024");
  form.set("height", "1024");
  const response = new Response(form);
  const contentType = response.headers.get("content-type") ?? "";
  return { multipart: { body: await response.arrayBuffer(), contentType } };
}
