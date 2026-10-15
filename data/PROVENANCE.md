# Pelican provenance

The public set contains one human-written prompt and 29 tasks from a seeded prompt grid. No third-party dataset is copied or downloaded.

## Canonical pelican prompt

- Kind: `human-written`
- URL: https://github.com/pooriaarab/benchmark-pelican/blob/main/scripts/gen-tasks.mjs
- Licence: `CC0-1.0`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Read the `canonical` task in `scripts/gen-tasks.mjs`, then run `npm run generate:tasks`.
- Contamination notes: The canonical prompt is public and widely discussed. It tests a known request, not a secret item.
- Refresh: Keep the prompt fixed so runs remain comparable.

## Seeded animal and bicycle grid

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-pelican/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.
- Contamination notes: Public tasks use seed 20261015 and a 2026-10-15 cutoff. For final comparisons, generate a hidden file with a private seed and keep it outside the repository and npm package.
- Refresh: Review yearly. Change the public seed only for a declared new data version. Generate a hidden split with `node scripts/gen-tasks.mjs --seed N --split hidden --output /secure/path/tasks.jsonl`.

Task prompts and reference SVGs are produced by the repository script. The required-parts labels are maintained with the generator and licensed with the tasks.
