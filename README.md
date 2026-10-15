# benchmark-pelican

[![npm](https://img.shields.io/npm/v/benchmark-pelican)](https://www.npmjs.com/package/benchmark-pelican) [![downloads](https://img.shields.io/npm/dm/benchmark-pelican)](https://www.npmjs.com/package/benchmark-pelican) [![license](https://img.shields.io/npm/l/benchmark-pelican)](./LICENSE) [![types](https://img.shields.io/badge/TypeScript-types-3178c6)](#sdk)

[AI Benchmark Index](https://private-repo-337e.com/benchmarks/benchmark-pelican) · [npm](https://www.npmjs.com/package/benchmark-pelican) · [Grading](./docs/grading.md) · [MCP](#model-context-protocol) · [HTTP API](#http-api)

benchmark-pelican is an open-source AI benchmark for SVG drawing and spatial reasoning. It asks models to draw birds riding bicycles, then checks the markup and geometry without a model judge.

```bash
npx benchmark-pelican run --provider mock
```

```json
{"model":"mock:1","mean":0.43333333333333335,"confidenceInterval95":{"low":0.26666666666666666,"high":0.6},"totals":{"tasks":30,"passed":13,"failed":0}}
```

The public set has one human-written canonical prompt and 29 tasks from a seeded animal and bicycle grid. The repository script creates every prompt, required-parts list, and mock reference SVG.

## Install

benchmark-pelican requires Node.js 20 or newer.

```bash
npm install benchmark-pelican
```

## Run your first benchmark

The mock provider uses no key or network call. Its fixed mix of good and bad drawings proves both grading paths.

```bash
npx benchmark-pelican run --provider mock
```

The command prints 30 task rows, a mean score, and a bootstrap 95% confidence interval. A score of 1 means every structural check passed. Partial credit identifies missing geometry in the reason field.

Run a real model through OpenRouter:

```bash
export OPENROUTER_API_KEY="your-key"
npx benchmark-pelican run --provider openrouter --model openai/gpt-5
```

The process exits successfully after all rows are graded. Save JSON with `--json > report.json` to create cards or galleries.

## How it works

```text
seeded tasks -> model SVG -> safety scan -> geometry checks -> scored report
                                      |-> CLI / SDK / MCP / HTTP API
```

The scanner rejects malformed, active, external, or oversized SVG. Weighted checks look for wheels, frame, handlebars, pedals, a bird body, a beak, legs, and useful canvas coverage.

## Why it exists

Simon Willison [popularised the pelican-on-a-bicycle prompt](https://simonwillison.net/2024/Oct/25/pelicans-on-a-bicycle/) as a quick visual model comparison. This package turns that delightful test into a repeatable public benchmark.

A screenshot contest is easy to understand but hard to reproduce. benchmark-pelican keeps tasks, provenance, grading code, and report surfaces in one versioned package.

## Compare

Checked on 2026-10-15.

| Property | benchmark-pelican | One-off prompt test | Vision-model judge |
| --- | --- | --- | --- |
| Task set | 30 versioned prompts | Usually one prompt | Depends on suite |
| Headline grading | Local deterministic scan | Human inspection | Model call |
| Offline run | Yes | Depends on model | No |
| Reasons | Per-check pass and miss list | Informal notes | Judge explanation |
| Main blind spot | Visual semantics | Reviewer variation | Judge variation and cost |

## Coverage

| Surface | Included | E2E check |
| --- | --- | --- |
| TypeScript SDK | Yes | Run and direct score |
| Command-line interface | Yes | Every command |
| Model Context Protocol server | Yes | Every tool |
| Fetch-style HTTP API | Yes | Every route |
| OpenRouter adapter | Yes | Key-free path not possible |
| OpenAI-compatible adapter | Yes | Key-free path not possible |
| Offline mock adapter | Yes | All 30 tasks |

The local gate checks every package surface. It does not make paid provider calls.

## Common use cases

1. **Model releases:** compare SVG structure before and after a model change.
2. **Prompt research:** use a private seed to test whether results survive wording changes.
3. **Agent tooling:** call deterministic scoring through Model Context Protocol (MCP).
4. **Evaluation pipelines:** serve the same tasks and scores through a fetch handler.
5. **Demos:** turn saved reports into an HTML gallery and SVG share card.

## Features

- **Deterministic score:** Run the same SVG through the same weighted checks.
- **Inspectable data:** Rebuild the public JSON Lines file with seed `20261015`.
- **Adversarial gate:** Empty, random, always-yes, and tool-call-only answers must score low.
- **Safe previews:** Reject scripts, external images, event handlers, and remote references.
- **Share output:** Put a passing submitted drawing beside its model score.

## SDK

```ts
import { benchmark, run, score } from "benchmark-pelican";
```

`run(adapter, options)` returns a benchmark-core report. `score(taskId, submission)` grades one SVG trace.

## CLI

Commands are `list`, `show`, `run`, `score`, `card`, `provenance`, `index-entry`, `serve`, and `mcp`. Add `--json` for machine-readable output.

```bash
npx benchmark-pelican card report.json card.svg
npm run gallery -- report.json another-report.json
```

The gallery command writes `artifacts/gallery.html` from saved reports.

## Model Context Protocol

Start the MCP stdio server:

```bash
npx benchmark-pelican mcp
```

Tools are `list_tasks`, `get_task`, `score_answer`, `run_benchmark`, and `get_provenance`.

## HTTP API

Import `handler` from `benchmark-pelican/api`, or run `npx benchmark-pelican serve`. Routes are `GET /health`, `GET /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/score`, `GET /v1/provenance`, and `GET /v1/index-entry`.

## Data provenance

`data/tasks.jsonl` holds the public set. `data/PROVENANCE.md` records source kinds, licences, the cutoff, regeneration steps, and the hidden split plan.

```bash
npm run generate:tasks
node scripts/gen-tasks.mjs --seed 9173 --split hidden --output /secure/path/tasks.jsonl
```

Keep hidden tasks outside the repository and package. Review public data yearly; change its seed only for a declared data version.

## Limits and known weaknesses

The grader checks structure, not visual truth. It cannot prove species, posture, occlusion, or artistic quality. Carefully chosen abstract geometry can pass.

Complex transforms, CSS, nested viewports, and unusual path commands can lose credit. Public prompts may enter training data. Remote providers can retain prompts and report cost under their own terms.

The optional vision judge is not implemented. No public leaderboard exists yet because this release did not run paid models.

## Integration guides

- [Structural grading rules and failure modes](./docs/grading.md)
- [Benchmark data and regeneration record](./data/PROVENANCE.md)
- [AI Benchmark Index entry](https://private-repo-337e.com/benchmarks/benchmark-pelican)

## Status

Version 0.1.0 is alpha. Task wording and heuristic weights can change before 1.0. Report defects through the [GitHub issue tracker](https://github.com/pooriaarab/benchmark-pelican/issues). Public case studies are not yet published.

## FAQ

### What does benchmark-pelican measure?

benchmark-pelican measures whether a model can produce safe SVG with plausible bird and bicycle geometry. The headline score is deterministic and structural.

### How does benchmark-pelican grade an SVG?

benchmark-pelican scans XML balance, safety, element count, geometry, color, and coverage. The [grading guide](./docs/grading.md) lists all weights and known failure modes.

### Can benchmark-pelican run offline?

benchmark-pelican runs end to end with the mock provider and no key. Real model runs require OpenRouter or an OpenAI-compatible endpoint.

### Which integrations are verified?

benchmark-pelican verifies the SDK, CLI, MCP server, HTTP API, and mock adapter in E2E. Paid provider adapters are supplied by benchmark-core and are not called by this repository gate.

### Does benchmark-pelican provide a managed benchmark service?

benchmark-pelican provides a server you run. It does not operate a managed endpoint.

### Where do benchmark-pelican tasks come from?

benchmark-pelican uses one human-written canonical prompt and a synthetic seeded grid. It copies no third-party dataset text.

### How is benchmark-pelican different from a one-off prompt test?

benchmark-pelican versions 30 tasks and applies the same published grader to each answer. A one-off test usually relies on a viewer's judgement.

### Can benchmark-pelican use a hidden split?

benchmark-pelican generates a hidden JSON Lines file from a private seed. Keep the seed and output outside public source control.

### Does benchmark-pelican know whether the drawing looks good?

benchmark-pelican does not measure beauty. It finds structural evidence and reports uncertainty through named misses and documented limits.

## License

[MIT](LICENSE) © Pooria Arab
