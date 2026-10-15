#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import type { RunReport } from "benchmark-core";
import { createCli } from "benchmark-core";
import { benchmark } from "./benchmark.js";
import { renderPelicanCard } from "./card.js";

const supplied = process.argv.slice(2);
const args = supplied[0] === "run" && supplied.includes("mock") && !supplied.includes("--model") ? [...supplied, "--model", "offline"] : supplied;
if (args[0] === "card") {
  try {
    const clean = args.slice(1).filter((arg) => arg !== "--json");
    if (!clean[0]) throw new Error("card needs a report JSON file.");
    const report = JSON.parse(await readFile(clean[0], "utf8")) as RunReport;
    if (!Array.isArray(report.rows)) throw new Error("File is not a run report.");
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
