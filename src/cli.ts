#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import type { RunReport } from "benchmark-core";
import { createCli } from "benchmark-core";
import { benchmark } from "./benchmark.js";
import { renderPelicanCard } from "./card.js";

function runReport(value: unknown): RunReport {
  if (value === null || typeof value !== "object" || !Array.isArray(Reflect.get(value, "rows"))) throw new Error("File is not a run report.");
  const identity = Reflect.get(value, "benchmark");
  if (identity === null || typeof identity !== "object" || typeof Reflect.get(identity, "name") !== "string" || typeof Reflect.get(value, "mean") !== "number") throw new Error("File is not a run report.");
  return value as RunReport;
}

const supplied = process.argv.slice(2);
const args = supplied[0] === "run" && supplied.includes("mock") && !supplied.includes("--model") ? [...supplied, "--model", "offline"] : supplied;
if (args[0] === "card") {
  try {
    const clean = args.slice(1).filter((arg) => arg !== "--json");
    if (!clean[0]) throw new Error("card needs a report JSON file.");
    const report = runReport(JSON.parse(await readFile(clean[0], "utf8")));
    const svg = renderPelicanCard(report);
    if (clean[1]) {
      await writeFile(clean[1], svg);
      console.log(args.includes("--json") ? JSON.stringify({ output: clean[1] }) : clean[1]);
    } else console.log(args.includes("--json") ? JSON.stringify({ svg }) : svg);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else process.exitCode = await createCli(benchmark, { bin: "benchmark-pelican" }).main(args);
