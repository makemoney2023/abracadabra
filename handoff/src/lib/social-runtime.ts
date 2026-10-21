import { openObjectStore, type ObjectStore } from "./store/objects";
import { openZernio, type ZernioClient } from "./zernio";

type SocialRuntime = {
  zernio: ZernioClient | null;
  store: ObjectStore | null;
};

let testRuntime: SocialRuntime | null = null;

/** Tests inject a client so plan execution never calls Zernio or R2. */
export function setSocialRuntimeForTests(runtime: { zernio?: ZernioClient | null; store?: ObjectStore | null } | null): void {
  testRuntime = runtime ? { zernio: runtime.zernio ?? null, store: runtime.store ?? null } : null;
}

export function zernioForCommands(): ZernioClient | null {
  if (testRuntime) return testRuntime.zernio;
  return openZernio();
}

export function storeForCommands(): ObjectStore | null {
  if (testRuntime) return testRuntime.store;
  return openObjectStore();
}
