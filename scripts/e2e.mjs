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
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/mock-report.json", `${JSON.stringify(report, null, 2)}\n`);
const listedCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "list", "--json"])).stdout);
assert.equal(listedCli.tasks.length, 30);
const shownCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "show", "public-pelican-bicycle", "--json"])).stdout);
assert.equal(shownCli.task.id, "public-pelican-bicycle");
const rescoredCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "score", "artifacts/mock-report.json", "--json"], { maxBuffer: 1_000_000 })).stdout);
assert.equal(rescoredCli.rows.length, 30);
await execFile(process.execPath, ["dist/cli.js", "card", "artifacts/mock-report.json", "artifacts/share-card.svg"]);
const shareCard = await readFile("artifacts/share-card.svg", "utf8");
assert.match(shareCard, /Pelican Bicycle SVG/);
assert.match(shareCard, /<svg x="680"[^>]+aria-label=/, "share card must embed a passing submitted drawing");
await writeFile("artifacts/not-a-report.json", '{"rows":[]}\n');
await assert.rejects(execFile(process.execPath, ["dist/cli.js", "card", "artifacts/not-a-report.json"]), /File is not a run report/);
const provenanceCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "provenance", "--json"])).stdout);
assert.equal(provenanceCli.provenance.length, 2);
const indexCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "index-entry", "--json"])).stdout);
assert.equal(indexCli.saturation, "unknown");
await execFile(process.execPath, ["scripts/gallery.mjs", "artifacts/mock-report.json"]);
assert.match(await readFile("artifacts/gallery.html", "utf8"), /saved submissions/);

const tasks = await benchmark.listTasks();
const bicycleOnly = '<svg viewBox="0 0 640 420"><rect width="640" height="420" fill="#eef"/><circle cx="170" cy="330" r="60" fill="none" stroke="#222" stroke-width="10"/><circle cx="470" cy="330" r="60" fill="none" stroke="#222" stroke-width="10"/><path d="M170 330L300 300L260 240M300 300L420 240L470 330M420 240L450 210" fill="none" stroke="#335" stroke-width="10"/><circle cx="300" cy="300" r="10" fill="#333"/></svg>';
const abstractShapes = `<svg viewBox="0 0 640 420">${Array.from({ length: 18 }, (_, i) => `<rect x="${(i * 37) % 560}" y="${(i * 53) % 380}" width="${20 + (i % 4) * 15}" height="${15 + (i % 3) * 20}" fill="${i % 2 ? "#7aa" : "#a7a"}"/><line x1="${i * 30}" y1="${i * 20}" x2="${i * 30 + 50}" y2="${i * 20 + 40}" stroke="#456" stroke-width="3"/>`).join("")}</svg>`;
const weakAnswers = [
  { name: "empty", submission: { answer: "" } },
  { name: "random", submission: { answer: "clouds have seven pockets" } },
  { name: "always-yes", submission: { answer: "yes" } },
  { name: "always-refuse", submission: { answer: "I cannot help with that request." } },
  { name: "same-tool-call", submission: { answer: "", toolLog: [{ id: "same", name: "finish_task", args: {}, result: { finished: true } }] } },
  { name: "constant-svg", submission: { answer: bicycleOnly } },
  { name: "abstract-shapes", submission: { answer: abstractShapes } },
];
const adversarialScores = {};
for (const strategy of weakAnswers) {
  const scores = await Promise.all(tasks.map((task) => benchmark.score(task, strategy.submission)));
  const values = scores.map(({ score }) => score);
  adversarialScores[strategy.name] = Math.round(values.reduce((a, b) => a + b, 0) / values.length * 1000) / 1000;
  assert.ok(values.every((score) => score <= 0.2), `${strategy.name} must score low on every task`);
}
const referenceScores = await Promise.all(tasks.map((task) => benchmark.score(task, { answer: String(task.expected) })));
assert.ok(referenceScores.every(({ score }) => score >= 0.85), "every generated reference must score high");
const referenceMean = referenceScores.reduce((a, { score }) => a + score, 0) / referenceScores.length;
for (const strategy of weakAnswers) assert.ok(adversarialScores[strategy.name] < referenceMean - 0.5, `${strategy.name} must be well below the reference policy`);

// A memorised drawing must not ace every task: replay the canonical pelican SVG
// and require a clear gap between matching and non-matching tasks.
const memorised = await Promise.all(tasks.map((task) => benchmark.score(task, { answer: String(tasks[0].expected) })));
assert.ok(memorised[0].score === 1, "canonical reference must ace its own task");
const nonPelican = memorised.filter((_score, index) => tasks[index].metadata?.animal !== "pelican");
assert.ok(nonPelican.every(({ score }) => score < 1), "a memorised pelican must not ace other animals");
assert.ok(nonPelican.reduce((a, { score }) => a + score, 0) / nonPelican.length < referenceMean - 0.1, "memorised answer must sit below the reference policy");

// Honest formatting must score high: one fence, prose wrap, prolog, comments,
// text-bearing elements, and the five XML entities are all accepted.
const canonical = String(tasks[0].expected);
const honestAnswers = [
  ["fenced", `\`\`\`svg\n${canonical}\n\`\`\``],
  ["prose", `Here is the SVG you asked for:\n${canonical}\nHope that helps.`],
  ["prolog", `<?xml version="1.0" encoding="UTF-8"?>\n${canonical}`],
  ["comment", `<!-- drawing -->\n${canonical.replace("</svg>", "<!-- done --></svg>")}`],
  ["title-element", canonical.replace("<rect", "<title>A pelican riding a bicycle</title><rect")],
  ["text-element", canonical.replace("</svg>", '<text x="20" y="34" font-size="20">a pelican</text></svg>')],
  ["entity", canonical.replace('aria-label="pelican riding a bicycle"', 'aria-label="pelican &amp; bicycle"')],
];
const honestScores = {};
for (const [name, answer] of honestAnswers) {
  const { score } = await benchmark.score(tasks[0], { answer });
  honestScores[name] = score;
  assert.ok(score >= 0.85, `honest ${name} answer must score high, got ${score}`);
}

const unsafeAnswers = [
  '<svg viewBox="0 0 100 100"><a href=javascript:alert(1)></a></svg>',
  '<svg viewBox="0 0 100 100"><style>@import "https://bad.invalid/x"</style></svg>',
  '<svg viewBox="0 0 100 100"><use href="#wheels"/></svg>',
  '<svg viewBox="0 0 100 100"><animate attributeName="href" to="javascript:alert(1)"/></svg>',
  '<svg viewBox="0 0 100 100"><image href="https://bad.invalid/x.png"/></svg>',
  '<svg viewBox="0 0 100 100"><foreignObject><p>html</p></foreignObject></svg>',
];
for (const answer of unsafeAnswers) assert.equal((await benchmark.score(tasks[0], { answer })).score, 0, "unsafe SVG must score zero");

// Hidden split: disjoint ids and prompts, never inside data/, and public
// reference answers must score below 1 on hidden tasks.
await assert.rejects(execFile(process.execPath, ["scripts/gen-tasks.mjs", "--split", "hidden", "--output", "artifacts/none.jsonl"], { env: { ...process.env, BPEL_HIDDEN_SEED: "" } }), /private seed|integer/, "hidden split must require a private seed");
const hiddenGen = await execFile(process.execPath, ["scripts/gen-tasks.mjs", "--split", "hidden", "--seed", "424242", "--output", "artifacts/tasks.hidden.jsonl"]);
assert.ok(!hiddenGen.stdout.includes("424242"), "hidden generation must not log the private seed");
const { createBenchmark } = await import("../dist/index.js");
const hiddenBenchmark = createBenchmark("artifacts/tasks.hidden.jsonl");
const hiddenTasks = await hiddenBenchmark.listTasks();
assert.equal(hiddenTasks.length, 30);
assert.ok(hiddenTasks.every((task) => task.id.startsWith("hidden-")), "hidden tasks need the hidden- id prefix");
const publicPrompts = new Set(tasks.map((task) => task.prompt));
assert.ok(hiddenTasks.every((task) => !publicPrompts.has(task.prompt)), "hidden prompts must differ from public prompts");
const hiddenCross = await Promise.all(hiddenTasks.map((task) => hiddenBenchmark.score(task, { answer: canonical })));
assert.ok(hiddenCross.every(({ score }) => score < 1), "a public reference must score below 1 on hidden tasks");
const hiddenCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "run", "--model", "offline", "--provider", "mock", "--tasks", "artifacts/tasks.hidden.jsonl", "--json"], { maxBuffer: 1_000_000 })).stdout);
assert.equal(hiddenCli.rows.length, 30);
assert.ok(Array.isArray(hiddenCli.checkSummary) && hiddenCli.checkSummary.length > 0, "run report must expose the check breakdown");
assert.ok(hiddenCli.rows.some((row) => Array.isArray(row.details) && row.details.length > 0), "run rows must expose per-check details");
const packed = JSON.parse((await execFile("npm", ["pack", "--dry-run", "--json"])).stdout);
assert.ok(!packed[0].files.some((file) => file.path.startsWith("hidden/") || file.path.includes("tasks.hidden")), "hidden split must not ship in the npm package");

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
const client = new Client({ name: "benchmark-pelican-e2e", version: "0.2.0" });
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
  adversarial_scores: adversarialScores,
  honest_answer_scores: honestScores,
  memorised_nonmatching_mean: Math.round(nonPelican.reduce((a, { score }) => a + score, 0) / nonPelican.length * 1000) / 1000,
  hidden_split: { tasks: hiddenTasks.length, public_reference_max: Math.max(...hiddenCross.map(({ score }) => score)) },
  reference_score_range: [Math.min(...referenceScores.map(({ score }) => score)), Math.max(...referenceScores.map(({ score }) => score))],
  route_status_codes: routes, tool_names: toolNames,
};
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.equal(await readFile("data/PROVENANCE.md", "utf8"), provenanceMarkdown(benchmark));
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
