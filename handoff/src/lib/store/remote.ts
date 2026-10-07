import type { ObjectStore } from "./objects";

const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

function endpoint(origin: string): string {
  return origin.replace(/\/$/, "");
}

async function call(origin: string, method: string, key: string, fetchImpl: typeof fetch): Promise<Response> {
  const response = await fetchImpl(`${endpoint(origin)}/${key}`, { method });
  if (response.status === 404) return response;
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || `object request failed (${response.status})`);
  }
  return response;
}

/** Object bytes over the scan container's outbound handler. Uploads stay on the client worker. */
export function remoteObjectStore(origin: string, fetchImpl: typeof fetch = fetch): ObjectStore {
  return {
    async stat(key) {
      if (!KEY.test(key)) return null;
      const response = await call(origin, "HEAD", key, fetchImpl);
      if (response.status === 404) return null;
      return { sizeBytes: Number(response.headers.get("content-length") || 0) };
    },
    async read(key) {
      if (!KEY.test(key)) return null;
      const response = await call(origin, "GET", key, fetchImpl);
      if (response.status === 404) return null;
      return new Uint8Array(await response.arrayBuffer());
    },
    async remove(key) {
      if (!KEY.test(key)) return;
      const response = await call(origin, "DELETE", key, fetchImpl);
      if (response.status === 404) return;
    },
    async put() {
      throw new Error("the scan container does not write objects");
    },
    async beginUpload() {
      throw new Error("the scan container does not write objects");
    },
    async readUpload() {
      return null;
    },
    async writePart() {
      throw new Error("the scan container does not write objects");
    },
    async finishUpload() {
      throw new Error("the scan container does not write objects");
    },
  };
}
