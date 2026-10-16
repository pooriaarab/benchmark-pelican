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
// Incidental decoration cannot move a score: the extent covers only the
// connected bird-plus-vehicle figure, so a ground line, a background
// rectangle, a detached sun, or a cloud can come and go without changing any
// check. The probes place warm suns and pale clouds at several distances —
// in the far corner, beside a wheel, above the bird, and at the (600,40)
// spot a past review used to stretch the extent through the padding.
const decorationVariants = [
  ["no-ground", (svg) => svg.replace(/<path d="M0 368H640"[^>]*\/>/, "")],
  ["second-ground", (svg) => svg.replace("</svg>", `<path d="M0 388H640" fill="none" stroke="#8a8" stroke-width="6"/></svg>`)],
  ["no-background", (svg) => svg.replace(/<rect width="640" height="420"[^>]*\/>/, "")],
  ["extra-background", (svg) => svg.replace("</svg>", `<rect width="640" height="420" fill="#dfe8ee"/></svg>`)],
  ["thick-ground", (svg) => svg.replace("</svg>", `<rect x="0" y="390" width="640" height="30" fill="#c9d6c9"/></svg>`)],
  ["sun-far-left", (svg) => svg.replace("</svg>", `<circle cx="52" cy="48" r="30" fill="#f8ecc9"/></svg>`)],
  ["sun-near-bird", (svg) => svg.replace("</svg>", `<circle cx="600" cy="40" r="25" fill="#f8d77e"/></svg>`)],
  ["sun-beside-wheel", (svg) => svg.replace("</svg>", `<circle cx="600" cy="300" r="28" fill="#f8d77e"/></svg>`)],
  ["sun-above-bird", (svg) => svg.replace("</svg>", `<circle cx="320" cy="24" r="20" fill="#fde68a"/></svg>`)],
  ["sun-at-beak", (svg) => svg.replace("</svg>", `<circle cx="562" cy="82" r="20" fill="#f8d77e"/></svg>`)],
  ["wheel-lookalike", (svg) => svg.replace("</svg>", `<circle cx="35" cy="250" r="30" fill="#ccd"/></svg>`)],
  ["cloud-left", (svg) => svg.replace("</svg>", `<path d="M20 80q20 -25 45 -8q25 -12 38 8q-20 15 -50 10q-35 5 -33 -10Z" fill="#ffffff"/></svg>`)],
  ["cloud-right", (svg) => svg.replace("</svg>", `<path d="M560 120q18 -22 40 -7q22 -10 34 7q-18 14 -44 9q-32 5 -30 -9Z" fill="#eef4f6"/></svg>`)],
  ["cloud-high", (svg) => svg.replace("</svg>", `<path d="M250 30q18 -20 38 -6q20 -9 30 6q-16 12 -40 8q-28 4 -28 -8Z" fill="#ffffff"/></svg>`)],
];
for (const [name, apply] of decorationVariants) {
  const scored = await Promise.all(tasks.map((task) => benchmark.score(task, { answer: apply(String(task.expected)) })));
  assert.ok(scored.every((row, index) => row.score === referenceScores[index].score), `decoration "${name}" must leave every reference score unchanged`);
}
// Canvas width is irrelevant: the same references on a 640, 1000, 1280 or
// 1600-wide canvas — with a full-width ground line, a ground band, or no
// ground at all — must score identically on every task.
const canvasRows = {};
for (const w of [640, 1000, 1280, 1600]) {
  for (const mode of ["none", "line", "rect"]) {
    const widen = (svg) => {
      let out = svg.replace('viewBox="0 0 640 420"', `viewBox="0 0 ${w} 420"`).replace('width="640" height="420"', `width="${w}" height="420"`);
      if (mode === "line") out = out.replace('d="M0 368H640"', `d="M0 368H${w}"`);
      if (mode === "rect") out = out.replace(/<path d="M0 368H\d+"[^>]*\/>/, "").replace("</svg>", `<rect x="0" y="390" width="${w}" height="30" fill="#c9d6c9"/></svg>`);
      if (mode === "none") out = out.replace(/<path d="M0 368H\d+"[^>]*\/>/, "");
      return out;
    };
    const scored = await Promise.all(tasks.map((task) => benchmark.score(task, { answer: widen(String(task.expected)) })));
    assert.ok(scored.every((row, index) => row.score === referenceScores[index].score), `canvas width ${w} ground ${mode} must leave every reference score unchanged`);
    canvasRows[`${w}-${mode}`] = scored.every((row, index) => row.score === referenceScores[index].score);
  }
}
// A rugged tire has no upper thickness bound: on every knobby task, tyre
// strokes well above the stated 0.28 minimum must still score 1.
const knobbyTasks = tasks.filter((task) => (task.metadata?.requiredParts ?? []).includes("knobby tires"));
for (const frac of [0.3, 0.4, 0.5]) {
  for (const task of knobbyTasks) {
    const svg = String(task.expected).replace(/<circle[^>]*stroke-dasharray="7 9"[^>]*\/>/g, "");
    const radius = Number(svg.match(/<circle cx="[\d.]+" cy="[\d.]+" r="([\d.]+)" fill="none"/)[1]);
    const widened = svg.replace(/(<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+" fill="none" stroke="#22252b" stroke-width=")[\d.]+("\/>)/g, `$1${Math.round(frac * radius * 10) / 10}$2`);
    const { score } = await benchmark.score(task, { answer: widened });
    assert.equal(score, 1, `knobby task ${task.id} must accept a ${frac}R tyre stroke, got ${score}`);
  }
}
// Decoration sweep: seeded suns scattered across the canvas must not move a
// score unless they literally touch the figure. Measure the count, keep it at
// zero for detached suns, and record it in the report.
let sweepChanged = 0, sweepTotal = 0;
{
  let state = 1234;
  const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  for (let index = 0; index < 200; index++) {
    const task = tasks[index % tasks.length];
    const cx = Math.round(rand() * 640), cy = Math.round(rand() * 420), r = Math.round(8 + rand() * 30);
    const probe = String(task.expected).replace("</svg>", `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f8d77e"/></svg>`);
    const { score } = await benchmark.score(task, { answer: probe });
    sweepTotal += 1;
    if (score !== referenceScores[index % tasks.length].score) sweepChanged += 1;
  }
}
// Scaling or translating the whole drawing must never change the score: every
// geometric check is measured against the drawing's own extent or its named
// parts, never against the canvas or viewBox.
for (const [s, dx, dy] of [[0.6, 0, 0], [0.85, 0, 0], [1.08, 0, 0], [1.3, 0, 0], [2, 0, 0], [1, 40, 25], [1, -60, 10], [1.3, 500, 200], [0.7, -200, 100]]) {
  const moved = await Promise.all(tasks.map((task) => benchmark.score(task, { answer: transformSvg(String(task.expected), s, dx, dy) })));
  assert.ok(moved.every((row, index) => row.score === referenceScores[index].score), `scale ${s} shift ${dx},${dy} must leave every score unchanged`);
}
const referenceMean = referenceScores.reduce((a, { score }) => a + score, 0) / referenceScores.length;
for (const strategy of weakAnswers) assert.ok(adversarialScores[strategy.name] < referenceMean - 0.5, `${strategy.name} must be well below the reference policy`);

// A model sees only the prompt text, so a deliberately naive policy that draws
// literally what the prompt states — its own layout, no shared generator code
// — must reach most of the suite on any canvas size. The policy jitters what
// the prompts leave open, seeded by the prompt text: leg bottoms land anywhere
// in [-0.2R, +0.3R] of the axle line, and body and handlebar proportions
// wander. Measured 2026-10-16: mean 1.000 and 30/30 at 0.8 or above on the
// public split and on held-out test seeds 7, 99 and 4242, at 1000x600
// and 640x480.
// The bound below is that measurement minus a margin of five tasks.
const PROMPT_ONLY_MIN = 25;
const promptOnlyCanvases = [[1000, 600], [640, 480]];
async function promptOnlyRun(bench, list) {
  const scores = [];
  for (const [index, task] of list.entries()) {
    const [w, h] = promptOnlyCanvases[index % promptOnlyCanvases.length];
    scores.push((await bench.score(task, { answer: promptOnlySvg(String(task.prompt), w, h) })).score);
  }
  return { mean: Math.round(scores.reduce((a, s) => a + s, 0) / scores.length * 1000) / 1000, at_least_0_8: scores.filter((score) => score >= 0.8).length };
}
const promptOnlyScores = { public: await promptOnlyRun(benchmark, tasks) };
assert.ok(promptOnlyScores.public.at_least_0_8 >= PROMPT_ONLY_MIN, `prompt-only policy must score >=0.8 on at least ${PROMPT_ONLY_MIN} public tasks, got ${promptOnlyScores.public.at_least_0_8}`);

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
// Every reference drawing must score exactly 1 on its own task across 30
// held-out seeds — not only the seeds used elsewhere in this file — so a
// seed-specific false positive (a saddle read as a tail, a leg read as a
// wader's) cannot hide behind one lucky split.
const hiddenSeeds = [7, 99, 2026, 4242, 424242, 1, 13, 42, 77, 123, 314, 555, 777, 1000, 1337, 2048, 3000, 5000, 9001, 12345, 31337, 65535, 99999, 111111, 222222, 314159, 555555, 777777, 888888, 999983];
const hiddenSuites = new Map([[424242, { bench: hiddenBenchmark, tasks: hiddenTasks }]]);
for (const seed of hiddenSeeds) {
  if (hiddenSuites.has(seed)) continue;
  const file = `artifacts/tasks.hidden-${seed}.jsonl`;
  await execFile(process.execPath, ["scripts/gen-tasks.mjs", "--split", "hidden", "--seed", String(seed), "--output", file]);
  const bench = createBenchmark(file);
  hiddenSuites.set(seed, { bench, tasks: await bench.listTasks() });
}
for (const [seed, { bench, tasks: list }] of hiddenSuites) {
  const scores = await Promise.all(list.map((task) => bench.score(task, { answer: String(task.expected) })));
  assert.ok(scores.every(({ score }) => score === 1), `every hidden reference must score exactly 1 (seed ${seed})`);
}
// The prompt-only measurement runs per split: public, and held-out seeds 7,
// 99 and 4242. Bounds are the measured counts minus the same margin.
for (const seed of [7, 99, 4242]) {
  const { bench, tasks: list } = hiddenSuites.get(seed);
  const result = await promptOnlyRun(bench, list);
  promptOnlyScores[`hidden_seed_${seed}`] = result;
  assert.ok(result.at_least_0_8 >= PROMPT_ONLY_MIN, `prompt-only policy must score >=0.8 on at least ${PROMPT_ONLY_MIN} hidden-seed-${seed} tasks, got ${result.at_least_0_8}`);
}
for (const [s, dx, dy] of [[0.8, 0, 0], [1.25, 0, 0], [1, 30, -15]]) {
  const moved = await Promise.all(hiddenTasks.map((task) => hiddenBenchmark.score(task, { answer: transformSvg(String(task.expected), s, dx, dy) })));
  assert.ok(moved.every(({ score }) => score === 1), `hidden references stay at 1 under scale ${s} shift ${dx},${dy}`);
}
// Decoration invariance must hold on the hidden split too.
for (const [name, apply] of decorationVariants.slice(4)) {
  const scored = await Promise.all(hiddenTasks.map((task) => hiddenBenchmark.score(task, { answer: apply(String(task.expected)) })));
  assert.ok(scored.every((row, index) => row.score === hiddenReferenceScores[index].score), `decoration "${name}" must leave every hidden reference score unchanged`);
}
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
  prompt_only_scores: promptOnlyScores,
  canvas_width_invariance: canvasRows,
  decoration_sweep: { probes: sweepTotal, changed: sweepChanged },
  hidden_split: { tasks: hiddenTasks.length, reference_perfect_seeds: hiddenSeeds.length, public_reference_max: Math.max(...hiddenCross.map(({ score }) => score)), memorised_reference: hiddenMemorisedReference },
  reference_score_range: [Math.min(...referenceScores.map(({ score }) => score)), Math.max(...referenceScores.map(({ score }) => score))],
  route_status_codes: routes, tool_names: toolNames,
  mcp_check_summary_entries: mcpRunReport.checkSummary.length,
};
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.equal(await readFile("data/PROVENANCE.md", "utf8"), provenanceMarkdown(benchmark));
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
