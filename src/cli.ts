#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrapCI, createCli, mockAdapter, openaiCompatAdapter, openrouterAdapter, renderMarkdown, run as coreRun, type Benchmark, type ModelAdapter, type RunReport, type Task } from "benchmark-core";
import { attachBreakdown, breakdownText, type PelicanReport } from "./breakdown.js";
import { benchmark, createBenchmark } from "./benchmark.js";
import { renderPelicanCard } from "./card.js";
import { createMcpServer } from "./mcp.js";

class UsageError extends Error {}

function runReport(value: unknown): RunReport {
  if (value === null || typeof value !== "object" || !Array.isArray(Reflect.get(value, "rows"))) throw new Error("File is not a run report.");
  const identity = Reflect.get(value, "benchmark");
  if (identity === null || typeof identity !== "object" || typeof Reflect.get(identity, "name") !== "string" || typeof Reflect.get(value, "mean") !== "number") throw new Error("File is not a run report.");
  return value as RunReport;
}

function adapter<T extends Task>(provider: string, model: string, bench: Benchmark<T>, seed: number): ModelAdapter {
  if (provider === "mock") return mockAdapter({ seed, ...bench.definition.mockPolicies ? { policies: bench.definition.mockPolicies } : {} });
  if (provider === "openrouter") return openrouterAdapter({ model });
  if (provider === "openai") return openaiCompatAdapter({ model });
  throw new UsageError("--provider must be openrouter, openai, or mock.");
}

function print(report: PelicanReport, json: boolean) {
  console.log(json ? JSON.stringify(report) : `${renderMarkdown(report)}${breakdownText(report)}`);
}

async function runCommand<T extends Task>(args: string[], json: boolean, bench: Benchmark<T>): Promise<number> {
  const parsed = parseArgs({ args, options: { model: { type: "string" }, provider: { type: "string" }, concurrency: { type: "string" }, timeout: { type: "string" }, retries: { type: "string" }, seed: { type: "string" }, "max-turns": { type: "string" }, "max-tool-calls": { type: "string" }, budget: { type: "string" } }, strict: true });
  const model = parsed.values.model, provider = parsed.values.provider;
  if (!model || !provider) throw new UsageError("run needs --model and --provider.");
  const seed = Number(parsed.values.seed ?? 1);
  const result = await coreRun(bench, adapter(provider, model, bench, seed), {
    ...parsed.values.concurrency ? { concurrency: Number(parsed.values.concurrency) } : {},
    ...parsed.values.timeout ? { timeoutMs: Number(parsed.values.timeout) } : {},
    ...parsed.values.retries ? { retries: Number(parsed.values.retries) } : {},
    seed,
    ...parsed.values["max-turns"] ? { maxTurns: Number(parsed.values["max-turns"]) } : {},
    ...parsed.values["max-tool-calls"] ? { maxToolCalls: Number(parsed.values["max-tool-calls"]) } : {},
    ...parsed.values.budget ? { budgetUsd: Number(parsed.values.budget) } : {},
  });
  const report = await attachBreakdown(result, bench);
  print(report, json);
  return report.rows.some((row) => row.error) ? 2 : 0;
}

async function scoreCommand<T extends Task>(args: string[], json: boolean, bench: Benchmark<T>): Promise<number> {
  const file = args[0];
  if (!file) throw new UsageError("score needs a results JSON file.");
  const original = runReport(JSON.parse(await readFile(file, "utf8")));
  const rows = [];
  for (const row of original.rows) {
    const task = await bench.getTask(row.taskId);
    if (!task || row.submission === undefined) throw new UsageError(`Cannot score task ${row.taskId}.`);
    const grade = await bench.score(task, row.submission, { seed: original.seed });
    rows.push({ ...row, score: grade.score, reason: grade.reason });
  }
  const scores = rows.map((row) => row.score);
  const rescored = { ...original, rows, mean: scores.reduce((a, b) => a + b, 0) / scores.length, confidenceInterval95: bootstrapCI(scores, original.seed) };
  print(await attachBreakdown(rescored, bench), json);
  return 0;
}

const supplied = process.argv.slice(2);
const tasksIndex = supplied.findIndex((arg) => arg === "--tasks" || arg.startsWith("--tasks="));
const inlineTasks = tasksIndex !== -1 && supplied[tasksIndex]!.startsWith("--tasks=");
const tasksPath = tasksIndex === -1 ? undefined : inlineTasks ? supplied[tasksIndex]!.slice("--tasks=".length) : supplied[tasksIndex + 1];
if (tasksIndex !== -1 && !tasksPath) {
  console.error("--tasks needs a JSONL file path.");
  process.exitCode = 1;
} else {
  const bench = tasksPath ? createBenchmark(tasksPath) : benchmark;
  const args = supplied.filter((_arg, index) => tasksIndex === -1 || index < tasksIndex || index >= tasksIndex + (inlineTasks ? 1 : 2));
  if (args[0] === "run" && args.includes("mock") && !args.includes("--model")) args.push("--model", "offline");
  const json = args.includes("--json");
  const clean = args.slice(1).filter((arg) => arg !== "--json");
  try {
    if (args[0] === "card") {
      if (!clean[0]) throw new UsageError("card needs a report JSON file.");
      const svg = renderPelicanCard(runReport(JSON.parse(await readFile(clean[0], "utf8"))));
      if (clean[1]) {
        await writeFile(clean[1], svg);
        console.log(json ? JSON.stringify({ output: clean[1] }) : clean[1]);
      } else console.log(json ? JSON.stringify({ svg }) : svg);
    } else if (args[0] === "run") process.exitCode = await runCommand(clean, json, bench);
    else if (args[0] === "score") process.exitCode = await scoreCommand(clean, json, bench);
    else if (args[0] === "mcp") await createMcpServer(bench).connect(new StdioServerTransport());
    else process.exitCode = await createCli(bench, { bin: "benchmark-pelican" }).main(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof UsageError ? 1 : 2;
  }
}
