import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { provenanceMarkdown } from "benchmark-core";
import { benchmark } from "../dist/index.js";
const execFile = promisify(execFileCallback);

await execFile("npm", ["run", "build"]);
const cli = await execFile(process.execPath, ["dist/cli.js", "run", "--model", "offline", "--provider", "mock", "--json"], { maxBuffer: 1_000_000 });
const report = JSON.parse(cli.stdout);
assert.equal(report.rows.length, 30);
assert.ok(report.rows.some((row) => row.score === 1));
assert.ok(report.rows.some((row) => row.score === 0));

const tasks = await benchmark.listTasks();
const weakAnswers = [
  { name: "empty", submission: { answer: "" } },
  { name: "random", submission: { answer: "clouds have seven pockets" } },
  { name: "always-yes", submission: { answer: "yes" } },
  { name: "same-tool-call", submission: { answer: "", toolLog: [{ id: "same", name: "finish_task", args: {}, result: { finished: true } }] } },
];
for (const strategy of weakAnswers) {
  const scores = await Promise.all(tasks.map((task) => benchmark.score(task, strategy.submission)));
  assert.ok(scores.every(({ score }) => score <= 0.2), `${strategy.name} must score low`);
}
const referenceScores = await Promise.all(tasks.map((task) => benchmark.score(task, { answer: String(task.expected) })));
assert.ok(referenceScores.every(({ score }) => score >= 0.85), "every generated reference must score high");
const unsafeAnswers = [
  '<svg viewBox="0 0 100 100"><a href=javascript:alert(1)></a></svg>',
  '<svg viewBox="0 0 100 100"><style>@import "https://bad.invalid/x"</style></svg>',
  '<svg viewBox="0 0 100 100"><use href="#wheels"/></svg>',
  '<svg viewBox="0 0 100 100"><animate attributeName="href" to="javascript:alert(1)"/></svg>',
];
for (const answer of unsafeAnswers) assert.equal((await benchmark.score(tasks[0], { answer })).score, 0, "unsafe SVG must score zero");

const probe = createNetServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address(); assert.ok(address && typeof address === "object");
await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, ["dist/cli.js", "serve", String(address.port)], { stdio: ["ignore", "pipe", "pipe"] });
const base = `http://127.0.0.1:${address.port}`; const routes = {};
async function get(path) {
  const response = await fetch(`${base}${path}`); routes[`GET ${path}`] = response.status;
  return { response, value: await response.json() };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { await get("/health"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); } }
  const health = await get("/health"); assert.equal(health.response.status, 200);
  const listed = await get("/v1/tasks"); assert.equal(listed.value.tasks.length, 30);
  const shown = await get("/v1/tasks/public-pelican-bicycle"); assert.equal(shown.value.task.id, "public-pelican-bicycle");
  const score = await fetch(`${base}/v1/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "public-pelican-bicycle", submission: report.rows[0].submission }) });
  routes["POST /v1/score"] = score.status; assert.equal(score.status, 200);
  assert.equal((await get("/v1/provenance")).response.status, 200);
  assert.equal((await get("/v1/index-entry")).value.task_count, 30);
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "benchmark-pelican-e2e", version: "0.1.0" });
await client.connect(transport); let toolNames;
try {
  const available = await client.listTools(); toolNames = available.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [
    ["list_tasks", {}], ["get_task", { taskId: "public-pelican-bicycle" }],
    ["score_answer", { taskId: "public-pelican-bicycle", submission: report.rows[0].submission }],
    ["get_provenance", {}], ["run_benchmark", { model: "offline" }],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    if (name === "run_benchmark") assert.equal(result.isError, true); else assert.notEqual(result.isError, true);
  }
} finally { await client.close(); }

const artifact = {
  task_count: report.rows.length, scores: report.rows.map((row) => row.score),
  adversarial_scores: Object.fromEntries(weakAnswers.map(({ name }) => [name, 0])),
  reference_score_range: [Math.min(...referenceScores.map(({ score }) => score)), Math.max(...referenceScores.map(({ score }) => score))],
  route_status_codes: routes, tool_names: toolNames,
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.equal(await readFile("data/PROVENANCE.md", "utf8"), provenanceMarkdown(benchmark));
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
