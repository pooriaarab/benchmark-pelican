import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { score } from '../../dist/index.js';
import { mean, wilson, bootstrap } from '../template/stats.mjs';
const read = async name => JSON.parse(await readFile(`paper/data/${name}.generated.json`));
const [runs, repeats, cross, simulated, tasks, summary, provenance] = await Promise.all(['runs','repeat','cross','simulated','tasks','summary','provenance'].map(read));
const hash = x => createHash('sha256').update(x).digest('hex'), estimate = xs => bootstrap([xs], gs => mean(gs[0]));
let rows = 0;
for (const { policy, report } of runs) {
  for (const r of report.rows) { const actual = await score(r.taskId, r.submission); assert.equal(actual.score, r.score); assert.equal(actual.reason, r.reason); rows++; }
  const expected = summary.controls.find(r => r.policy === policy);
  assert.deepEqual(expected.mean, estimate(report.rows.map(r => r.score)));
  assert.deepEqual(expected.success, wilson(report.rows.filter(r => r.score >= .8).length, tasks.length));
  const semantic = report => report.rows.map(r => ({ taskId: r.taskId, submission: r.submission, score: r.score, details: r.details }));
  const repeat = repeats.find(r => r.policy === policy);
  assert.deepEqual(semantic(report), semantic(repeat.report)); assert.equal(hash(JSON.stringify(semantic(report))), repeat.firstHash); assert.equal(repeat.firstHash, repeat.repeatHash);
}
for (const r of cross) { assert.equal((await score(tasks[r.target].id, { answer: tasks[r.source].expected })).score, r.score); rows++; }
const targetMeans = tasks.map((_, i) => mean(cross.filter(r => r.target === i && r.source !== i).map(r => r.score)));
assert.deepEqual(summary.cross.mean, estimate(targetMeans));
assert.deepEqual(summary.cross.gain, estimate(targetMeans.map((x,i) => cross.find(r => r.target === i && r.source === i).score - x)));
for (const condition of summary.population) {
  const cells = simulated.filter(r => r.probability === condition.probability);
  for (const cell of cells) {
    const agent = condition.agents.find(a => a.agent === cell.agent);
    for (const r of cell.rows) assert.equal(r.restored, runs.find(x => x.policy === 'literal').report.rows.find(x => x.taskId === r.taskId).score);
    for (const r of cell.rows) { assert.equal((await score(r.taskId, { answer: r.answer })).score, r.score); rows++; }
    assert.deepEqual(agent.mean, estimate(cell.rows.map(r => r.score)));
    assert.deepEqual(agent.success, wilson(cell.rows.filter(r => r.score >= .8).length, tasks.length));
    assert.equal(agent.gain, mean(cell.rows.map(r => r.restored-r.score)));
  }
  assert.deepEqual(condition.mean, estimate(cells.map(c => mean(c.rows.map(r => r.score)))));
  assert.deepEqual(condition.gain, estimate(cells.map(c => mean(c.rows.map(r => r.restored-r.score)))));
}
for (const [file, expected] of Object.entries(provenance.files)) assert.equal(hash(await readFile(file)), expected, file);
const meta = JSON.parse(await readFile('paper/meta.json')), cff = await readFile('CITATION.cff', 'utf8');
assert.ok(meta.abstract.length <= 1920 && /^[\x00-\x7f]*$/.test(meta.abstract));
assert.ok(cff.includes(meta.title) && cff.includes(meta.authors[0].orcid)); assert.equal(meta.license, 'CC-BY-4.0');
const text = execFileSync('pdftotext', ['paper/pelican-paper.pdf', '-'], { encoding: 'utf8' });
assert.ok(text.includes('Caveats') && text.includes('Authors') && !text.includes('??') && !text.includes('\u2014'));
const pages = +execFileSync('pdfinfo', ['paper/pelican-paper.pdf'], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)[1]; assert.ok(pages >= 8);
const artifact = { replayedRows: rows, repeatedPolicies: repeats.length, summaryMatches: true, sourceHashesMatch: true, metadataMatches: true, pages, pdfTextChecks: true, pdfSha256: hash(await readFile('paper/pelican-paper.pdf')) };
await writeFile('paper/data/verification.generated.json', JSON.stringify(artifact, null, 2)+'\n'); console.log(JSON.stringify(artifact));
