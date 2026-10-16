import { createHandler } from "benchmark-core";
import { createBenchmark } from "./benchmark.js";
export function createApiHandler(options?: { tasksPath?: string }) {
  return createHandler(createBenchmark(options?.tasksPath));
}
export const handler = createApiHandler();
