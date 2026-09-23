import type { ParallelClient } from "./types";

export function createMockParallel(handlers: {
  extract?: ParallelClient["extract"];
  search?: ParallelClient["search"];
  findAllAndEnrich?: ParallelClient["findAllAndEnrich"];
}): ParallelClient {
  return {
    extract: handlers.extract ?? (async (urls) => urls.map((url) => ({ url, content: "" }))),
    search: handlers.search ?? (async () => []),
    findAllAndEnrich: handlers.findAllAndEnrich ?? (async () => []),
  };
}
