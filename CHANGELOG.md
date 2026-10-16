# Changelog

## 0.2.0 - 2026-10-16

Scoring changes in this release make 0.1.0 results not comparable with 0.2.0 results.

- The grader now scores each task against its own `metadata.requiredParts`, and the score is multiplicative: a shared-structure gate times a task-specific fit that drops by 0.4 per missed or unrequested part. One memorised drawing scores at most 0.4 on a task it was not drawn for, and every generated reference scores exactly 1.0 on its own task. Abstract shapes cap at 0.2 through the bicycle-or-bird evidence gate.
- The scanner accepts honest formatting again: one surrounding code fence, prose around the block, an XML prolog, comments, `title`/`desc`/`text`/`tspan` elements, and the five XML entities all pass. `script`, `foreignObject`, `image`, event handlers, and external references still score 0.
- Warm-colour detection rejects cream and near-white fills. Legs must reach the pedal zone and handlebars must sit above the front wheel. Relative path commands resolve to real bounds.
- Task data now draws distinct seeded geometry per animal and vehicle pair. The hidden split uses disjoint animal and vehicle pools, a `hidden-` id prefix, and writes to `hidden/` outside `data/`, so it never ships in the npm package; it always requires a private seed (`--seed N` or `BPEL_HIDDEN_SEED`).
- The CLI, SDK, and API accept a task file override: `--tasks <path>`, `run(adapter, { tasksPath })`, and `createApiHandler({ tasksPath })`.
- Run reports expose `checkSummary` (pass rate per check) and per-row `details`, and the E2E report records measured adversarial scores. The MCP `run_benchmark` tool returns the same enriched report as the CLI, and `score(taskId, submission, { tasksPath })` grades against a generated split file.
- The drawing extent is the connected bird-plus-vehicle figure only: background rectangles, long thin ground or horizon lines, and detached decoration (a sun, a cloud) no longer stretch the extent or flip the wheel checks. Every score row also reports the measured extent under `details.extent`.
- Checks that could not be derived from the prompt text were deleted or restated: the long/standard wheelbase split is gone, wheel size is measured against the scene's height, a battery pack must be nearly as wide as a wheel so a rectangular saddle cannot read as one, pedals accept any small shape between the wheels, handlebars are measured against the wheel band instead of the whole drawing, "long legs" means thin legs dangling below the wheel axles, and each beak threshold is stated in the prompt. A prompt-only policy scores 1.0 on all 30 public tasks and 30 of 30 on two hidden seeds.
