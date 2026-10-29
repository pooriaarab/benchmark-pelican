import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { benchmark, run, score } from '../../dist/index.js';
import { literalPolicySvg } from '../../scripts/literal-policy.mjs';
import { mean, wilson, bootstrap } from '../template/stats.mjs';
const config = JSON.parse(await readFile('paper/config.json'));
const tasks = await benchmark.listTasks(), hash = x => createHash('sha256').update(x).digest('hex');
await mkdir('paper/data', { recursive: true });
const save = (name, data) => writeFile(`paper/data/${name}.generated.json`, JSON.stringify(data, null, 2) + '\n');
const estimate = xs => bootstrap([xs], groups => mean(groups[0]));
const summarize = rows => ({ mean: estimate(rows.map(r => r.score)), success: wilson(rows.filter(r => r.score >= .8).length, rows.length) });
const policies = { empty: () => '', constant: () => 'OK', echo: t => t.prompt, refusal: () => 'I cannot help with that request.', canonical: () => tasks[0].expected, reference: t => t.expected, literal: t => literalPolicySvg(t.prompt) };
const runs = [], repeats = [], controls = [];
const semantic = report => report.rows.map(r => ({ taskId: r.taskId, submission: r.submission, score: r.score, details: r.details }));
for (const [policy, answer] of Object.entries(policies)) {
  const adapter = { id: `script:${policy}`, complete: async (_prompt, { task }) => ({ content: answer(task) }), chat: async () => { throw Error('No episodes expected'); } };
  const report = await run(adapter, { concurrency: 1, retries: 0, seed: 20261029 });
  const repeated = await run(adapter, { concurrency: 1, retries: 0, seed: 20261029 });
  const firstHash = hash(JSON.stringify(semantic(report))), repeatHash = hash(JSON.stringify(semantic(repeated)));
  assert.equal(firstHash, repeatHash); runs.push({ policy, report }); repeats.push({ policy, firstHash, repeatHash, report: repeated });
  controls.push({ policy, ...summarize(report.rows) });
}
const cross = [];
for (let target = 0; target < tasks.length; target++) for (let source = 0; source < tasks.length; source++) cross.push({ target, source, ...(await score(tasks[target].id, { answer: tasks[source].expected })) });
const targetMeans = tasks.map((_, target) => mean(cross.filter(r => r.target === target && r.source !== target).map(r => r.score)));
const rng = seed => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const simulated = [], population = [];
for (const probability of [0, .1, .25, .5, .75]) {
  const agents = [];
  for (let agent = 1; agent <= 20; agent++) {
    const random = rng(agent), rows = [];
    for (const task of tasks) {
      const original = literalPolicySvg(task.prompt);
      const corrupted = original.replace(/<(?:circle|ellipse|path|rect|line|polyline|polygon)\b[^>]*\/>/g, element => random() < probability ? '' : element);
      const damaged = await score(task.id, { answer: corrupted }), restored = await score(task.id, { answer: original });
      rows.push({ taskId: task.id, answer: corrupted, score: damaged.score, details: damaged.details, restored: restored.score });
    }
    simulated.push({ label: 'simulated', probability, agent, rows });
    agents.push({ agent, ...summarize(rows), restored: mean(rows.map(r => r.restored)), gain: mean(rows.map(r => r.restored - r.score)) });
  }
  population.push({ label: 'simulated', probability, agents, mean: estimate(agents.map(a => a.mean.value)), restored: estimate(agents.map(a => a.restored)), gain: estimate(agents.map(a => a.gain)) });
}
const coverage = key => Object.entries(tasks.reduce((acc, t) => { acc[t.metadata[key]] = (acc[t.metadata[key]] ?? 0) + 1; return acc; }, {})).map(([name, n]) => ({ name, n }));
await save('runs', runs); await save('repeat', repeats); await save('cross', cross); await save('simulated', simulated);
await save('tasks', tasks);
await save('summary', { n: tasks.length, protocol: { agents: 20, probabilities: population.map(r => r.probability), bootstrap_draws: 2000, bootstrap_seed: 20261029, penalty: +String(await readFile('src/svg-grader.ts')).match(/const MISS_FACTOR = ([0-9.]+)/)[1] }, controls, animal: coverage('animal'), vehicle: coverage('vehicle'), cross: { mean: estimate(targetMeans), gain: estimate(targetMeans.map(x => 1 - x)), max: Math.max(...cross.filter(r => r.source !== r.target).map(r => r.score)) }, population, free_models: 'Not configured or probed; no learned-model results.' });
const sources = ['src/svg-grader.ts', 'data/tasks.jsonl', 'scripts/literal-policy.mjs', 'package-lock.json', 'paper/PREREG.md', 'paper/config.json', 'paper/scripts/run.mjs'];
await save('provenance', { source_commit: config.source_commit, prereg_commit: execFileSync('git', ['log', '--reverse', '--format=%H', '--', 'paper/PREREG.md'], { encoding: 'utf8' }).trim().split('\n')[0], node: process.version, files: Object.fromEntries(await Promise.all(sources.map(async p => [p, hash(await readFile(p))]))), semantic_hashes: repeats.map(({ policy, firstHash }) => ({ policy, firstHash })) });
console.log(`Study complete: ${tasks.length} tasks, ${runs.length} policies, ${cross.length} replay cells, ${simulated.length} simulated agents across conditions.`);
