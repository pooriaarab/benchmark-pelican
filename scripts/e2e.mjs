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
import { GATE_PARTS, PART_PHRASES } from "./parts.mjs";
import { promptOnlySvg, transformSvg } from "./prompt-policy.mjs";
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
// Only the validated extracted SVG may reach the share card: a hostile first
// fence followed by a clean fence must leave no markup behind.
const hostileReport = JSON.parse(JSON.stringify(report));
hostileReport.rows[0].score = 0.9;
hostileReport.rows[0].submission = { answer: `\`\`\`svg\n<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="10" height="10"/></svg>\n\`\`\`\n\`\`\`svg\n<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#396"/></svg>\n\`\`\`` };
await writeFile("artifacts/hostile-report.json", `${JSON.stringify(hostileReport)}\n`);
await execFile(process.execPath, ["dist/cli.js", "card", "artifacts/hostile-report.json", "artifacts/hostile-card.svg"]);
const hostileCard = await readFile("artifacts/hostile-card.svg", "utf8");
assert.ok(!hostileCard.includes("onload"), "share card must not embed unvalidated markup");
assert.match(hostileCard, /viewBox="0 0 10 10"/, "share card must embed the validated fence");
const provenanceCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "provenance", "--json"])).stdout);
assert.equal(provenanceCli.provenance.length, 2);
const indexCli = JSON.parse((await execFile(process.execPath, ["dist/cli.js", "index-entry", "--json"])).stdout);
assert.equal(indexCli.saturation, "unknown");
await execFile(process.execPath, ["scripts/gallery.mjs", "artifacts/mock-report.json"]);
assert.match(await readFile("artifacts/gallery.html", "utf8"), /saved submissions/);

const tasks = await benchmark.listTasks();
const abstractShapes = `<svg viewBox="0 0 640 420">${Array.from({ length: 18 }, (_, i) => `<rect x="${(i * 37) % 560}" y="${(i * 53) % 380}" width="${20 + (i % 4) * 15}" height="${15 + (i % 3) * 20}" fill="${i % 2 ? "#7aa" : "#a7a"}"/><line x1="${i * 30}" y1="${i * 20}" x2="${i * 30 + 50}" y2="${i * 20 + 40}" stroke="#456" stroke-width="3"/>`).join("")}</svg>`;
const weakAnswers = [
  { name: "empty", submission: { answer: "" } },
  { name: "random", submission: { answer: "clouds have seven pockets" } },
  { name: "always-yes", submission: { answer: "yes" } },
  { name: "always-refuse", submission: { answer: "I cannot help with that request." } },
  { name: "same-tool-call", submission: { answer: "", toolLog: [{ id: "same", name: "finish_task", args: {}, result: { finished: true } }] } },
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
assert.ok(referenceScores.every(({ score }) => score === 1), "every generated reference must score exactly 1");
// Scaling or translating the whole drawing must never change the score: every
// geometric check is measured against the drawing's own extent or its named
// parts, never against the canvas or viewBox.
for (const [s, dx, dy] of [[0.6, 0, 0], [0.85, 0, 0], [1.08, 0, 0], [1.3, 0, 0], [2, 0, 0], [1, 40, 25], [1, -60, 10], [1.3, 500, 200], [0.7, -200, 100]]) {
  const moved = await Promise.all(tasks.map((task) => benchmark.score(task, { answer: transformSvg(String(task.expected), s, dx, dy) })));
  assert.ok(moved.every((row, index) => row.score === referenceScores[index].score), `scale ${s} shift ${dx},${dy} must leave every score unchanged`);
}
const referenceMean = referenceScores.reduce((a, { score }) => a + score, 0) / referenceScores.length;
for (const strategy of weakAnswers) assert.ok(adversarialScores[strategy.name] < referenceMean - 0.5, `${strategy.name} must be well below the reference policy`);

// A model sees only the prompt text, so a policy that draws literally what the
// prompt states must nearly ace the suite on any canvas size.
const promptOnlyCanvases = [[1000, 600], [640, 480], [800, 500]];
const promptOnly = [];
for (const [index, task] of tasks.entries()) {
  const [w, h] = promptOnlyCanvases[index % promptOnlyCanvases.length];
  const { score, reason } = await benchmark.score(task, { answer: promptOnlySvg(String(task.prompt), w, h) });
  promptOnly.push(score);
  assert.ok(score >= 0.8, `prompt-only drawing on ${task.id} scores ${score}: ${reason.slice(0, 160)}`);
}

// The real memorised-reference attack: replay every task's own reference drawing
// against every other task. One memorised SVG must not separate from a wrong
// answer: no pair may exceed 0.4, the mismatched mean stays under 0.3, and the
// best single reference to memorise averages under 0.4 across the suite.
async function memorisedReferenceProbe(splitTasks, bench) {
  const perReference = [];
  const mismatched = [];
  for (const [index, source] of splitTasks.entries()) {
    const row = [];
    for (const [target, task] of splitTasks.entries()) {
      if (index === target) continue;
      const { score } = await bench.score(task, { answer: String(source.expected) });
      row.push(score);
      mismatched.push(score);
      assert.ok(score <= 0.4, `reference of ${source.id} scores ${score} on ${task.id}`);
    }
    perReference.push({ id: source.id, mean: row.reduce((a, b) => a + b, 0) / row.length });
  }
  const mismatchedMean = mismatched.reduce((a, b) => a + b, 0) / mismatched.length;
  const best = perReference.reduce((top, entry) => (entry.mean > top.mean ? entry : top));
  assert.ok(mismatchedMean <= 0.3, `mismatched reference mean ${mismatchedMean} must be <= 0.3`);
  assert.ok(best.mean <= 0.4, `best memorised reference ${best.id} averages ${best.mean}, must be <= 0.4`);
  return {
    pairwise_max: Math.max(...mismatched),
    mismatched_mean: Math.round(mismatchedMean * 1000) / 1000,
    best_reference: { id: best.id, mean: Math.round(best.mean * 1000) / 1000 },
  };
}
const memorisedReference = await memorisedReferenceProbe(tasks, benchmark);

// A model sees only the system text and task.prompt, so every part the grader
// checks must be stated there.
for (const task of tasks) {
  const parts = task.metadata?.requiredParts ?? [];
  const specific = parts.filter((part) => !GATE_PARTS.includes(part));
  assert.ok(specific.length >= 3, `${task.id} needs at least 3 task-specific parts`);
  const lower = String(task.prompt).toLowerCase();
  for (const part of parts) {
    const phrase = PART_PHRASES[part] ?? part;
    assert.ok(lower.includes(phrase), `${task.id} prompt does not state "${phrase}"`);
  }
}

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

// Colour and stroke may arrive through a <g>, an inline style, or a <style>
// class rule: the pelican's beak still reads as a warm beak in each form.
const beakPaths = canonical.match(/<path d="M[^"]+" fill="(#[0-9a-f]+)" stroke="#9c6644" stroke-width="4"\/><path d="M[^"]+" fill="#[0-9a-f]+" stroke="#9c6644" stroke-width="4"\/>/);
assert.ok(beakPaths, "reference keeps its two warm beak paths");
const bareBeak = beakPaths[0].replaceAll(/ fill="#[0-9a-f]+"/g, "");
const painted = [
  ["g-fill", `<g fill="${beakPaths[1]}">${bareBeak}</g>`],
  ["inline-style", beakPaths[0].replaceAll(/ fill="(#[0-9a-f]+)"/g, ' style="fill:$1"')],
  ["class-rule", `<style>.bk{fill:${beakPaths[1]}}</style>${bareBeak.replaceAll("<path ", '<path class="bk" ')}`],
];
for (const [name, markup] of painted) {
  const { score } = await benchmark.score(tasks[0], { answer: canonical.replace(beakPaths[0], markup) });
  assert.equal(score, 1, `beak painted via ${name} must still score 1`);
}
for (const hostile of [
  `<svg viewBox="0 0 100 100"><style>@import "https://bad.invalid/x"</style><rect width="10" height="10"/></svg>`,
  `<svg viewBox="0 0 100 100"><style>.a{fill:url(https://bad.invalid/x)}</style><rect class="a" width="10" height="10"/></svg>`,
  `<svg viewBox="0 0 100 100"><style>rect{fill:#000}</style><rect width="10" height="10"/></svg>`,
]) assert.equal((await benchmark.score(tasks[0], { answer: hostile })).score, 0, "unsafe or unsupported stylesheet must score zero");

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
const hiddenReferenceScores = await Promise.all(hiddenTasks.map((task) => hiddenBenchmark.score(task, { answer: String(task.expected) })));
assert.ok(hiddenReferenceScores.every(({ score }) => score === 1), "every hidden reference must score exactly 1");
for (const [s, dx, dy] of [[0.8, 0, 0], [1.25, 0, 0], [1, 30, -15]]) {
  const moved = await Promise.all(hiddenTasks.map((task) => hiddenBenchmark.score(task, { answer: transformSvg(String(task.expected), s, dx, dy) })));
  assert.ok(moved.every(({ score }) => score === 1), `hidden references stay at 1 under scale ${s} shift ${dx},${dy}`);
}
const hiddenPromptOnly = [];
for (const [index, task] of hiddenTasks.entries()) {
  const [w, h] = promptOnlyCanvases[index % promptOnlyCanvases.length];
  hiddenPromptOnly.push((await hiddenBenchmark.score(task, { answer: promptOnlySvg(String(task.prompt), w, h) })).score);
}
assert.ok(hiddenPromptOnly.filter((score) => score >= 0.8).length >= 25, "prompt-only policy must solve at least 25 of 30 hidden tasks");
const hiddenMemorisedReference = await memorisedReferenceProbe(hiddenTasks, hiddenBenchmark);
for (const task of hiddenTasks) {
  const lower = String(task.prompt).toLowerCase();
  for (const part of task.metadata?.requiredParts ?? []) {
    const phrase = PART_PHRASES[part] ?? part;
    assert.ok(lower.includes(phrase), `${task.id} prompt does not state "${phrase}"`);
  }
}
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

// The mcp command must serve this package's enriched server, not the core one:
// drive run_benchmark over the real bin with a stubbed fetch and require the
// run report's checkSummary.
const transport = new StdioClientTransport({
  command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe",
  env: { OPENROUTER_API_KEY: "e2e-stub", NODE_OPTIONS: "--import ./scripts/e2e-fetch-stub.mjs" },
});
const client = new Client({ name: "benchmark-pelican-e2e", version: "0.2.0" });
await client.connect(transport); let toolNames; let mcpRunReport;
try {
  const available = await client.listTools(); toolNames = available.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [
    ["list_tasks", {}], ["get_task", { taskId: "public-pelican-bicycle" }],
    ["score_answer", { taskId: "public-pelican-bicycle", submission: report.rows[0].submission }],
    ["get_provenance", {}],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true);
  }
  const ran = await client.callTool({ name: "run_benchmark", arguments: { model: "e2e-stub" } });
  assert.notEqual(ran.isError, true);
  mcpRunReport = JSON.parse(ran.content[0].text);
  assert.ok(Array.isArray(mcpRunReport.checkSummary) && mcpRunReport.checkSummary.length > 0, "MCP run_benchmark must return checkSummary");
  assert.ok(mcpRunReport.rows.length === 30 && mcpRunReport.rows.some((row) => row.details?.length > 0), "MCP report rows must carry per-check details");
} finally { await client.close(); }

const artifact = {
  task_count: report.rows.length, scores: report.rows.map((row) => row.score),
  adversarial_scores: adversarialScores,
  honest_answer_scores: honestScores,
  memorised_reference: memorisedReference,
  prompt_only_scores: { mean: Math.round(promptOnly.reduce((a, b) => a + b, 0) / promptOnly.length * 1000) / 1000, at_least_0_8: promptOnly.filter((score) => score >= 0.8).length, hidden_at_least_0_8: hiddenPromptOnly.filter((score) => score >= 0.8).length },
  hidden_split: { tasks: hiddenTasks.length, public_reference_max: Math.max(...hiddenCross.map(({ score }) => score)), memorised_reference: hiddenMemorisedReference },
  reference_score_range: [Math.min(...referenceScores.map(({ score }) => score)), Math.max(...referenceScores.map(({ score }) => score))],
  route_status_codes: routes, tool_names: toolNames,
  mcp_check_summary_entries: mcpRunReport.checkSummary.length,
};
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.equal(await readFile("data/PROVENANCE.md", "utf8"), provenanceMarkdown(benchmark));
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
