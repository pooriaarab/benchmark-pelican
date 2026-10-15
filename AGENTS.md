# Working on benchmark-pelican

## Commands

- Install with `npm ci`.
- Run the full gate with `npm run ci:local`.
- Generate tasks with `npm run generate:tasks`.
- Generate provenance after building with `npm run provenance`.
- Build a saved-report gallery with `npm run gallery -- report.json`.
- Add no unit tests. Extend `scripts/e2e.mjs` through a public surface.

## Contracts

Keep tasks, deterministic grading, and provenance in sync. Episode environments must be seeded. Grade episode traces by replaying their tool log.

SVG grading is structural. Keep `docs/grading.md` weights, implementation reasons, reference drawings, and adversarial E2E cases aligned. Never award points for labels or element IDs.

The public set uses seed 20261015. Hidden splits use a private seed and stay outside this repository and npm package.

Never read provider keys from repository files. OpenRouter uses `OPENROUTER_API_KEY`. OpenAI-compatible providers use `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

Open an issue before a branch. Use `bpel-<issue>-<slug>` and `[bpel-<issue>] Imperative subject`. Keep pull requests below 500 counted lines. Do not merge your own pull request or push `release`.
