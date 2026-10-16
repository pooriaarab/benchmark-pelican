import { run as runBenchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { benchmark, createBenchmark } from "./benchmark.js";
import { attachBreakdown, type PelicanReport } from "./breakdown.js";
export { benchmark, createBenchmark, attachBreakdown };
export type { PelicanReport };
export async function run(adapter: ModelAdapter, options?: RunOptions & { tasksPath?: string }): Promise<PelicanReport> {
  const { tasksPath, ...rest } = options ?? {};
  const bench = createBenchmark(tasksPath);
  return attachBreakdown(await runBenchmark(bench, adapter, rest), bench);
}
export async function score(taskId: string, submission: Trace) {
  const task = await benchmark.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return benchmark.score(task, submission);
}
