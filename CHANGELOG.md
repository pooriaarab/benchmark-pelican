# Changelog

## 0.2.0 - 2026-10-16

Scoring changes in this release make 0.1.0 results not comparable with 0.2.0 results.

- The grader now scores each task against its own `metadata.requiredParts` instead of one fixed checklist, with per-animal beak styles and per-vehicle parts. One memorised SVG no longer scores 1.0 on every task, and abstract shapes cap at 0.2 through the bicycle-or-bird evidence gate.
- The scanner accepts honest formatting again: one surrounding code fence, prose around the block, an XML prolog, comments, `title`/`desc`/`text`/`tspan` elements, and the five XML entities all pass. `script`, `foreignObject`, `image`, event handlers, and external references still score 0.
- Warm-colour detection rejects cream and near-white fills. Legs must reach the pedal zone and handlebars must sit above the front wheel. Relative path commands resolve to real bounds.
- Task data now draws distinct seeded geometry per animal and vehicle pair. The hidden split uses disjoint animal and vehicle pools, a `hidden-` id prefix, its own default seed, and writes to `hidden/` outside `data/`, so it never ships in the npm package.
- The CLI, SDK, and API accept a task file override: `--tasks <path>`, `run(adapter, { tasksPath })`, and `createApiHandler({ tasksPath })`.
- Run reports expose `checkSummary` (pass rate per check) and per-row `details`, and the E2E report records measured adversarial scores.
