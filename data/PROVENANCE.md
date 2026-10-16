# Pelican Bicycle SVG provenance

This file is generated from the benchmark definition.

## Canonical pelican prompt

- Kind: `human-written`
- URL: https://github.com/pooriaarab/benchmark-pelican/blob/main/scripts/gen-tasks.mjs
- Licence: `CC0-1.0`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Read the canonical task in scripts/gen-tasks.mjs, then run `npm run generate:tasks`.
- Contamination notes: The canonical prompt is public and widely discussed. It tests a known request, not a secret item.
- Refresh: Keep the canonical prompt fixed so runs remain comparable.

## Seeded animal and bicycle grid

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-pelican/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.
- Contamination notes: Public seed 20261015 has a 2026-10-15 cutoff. Generate a private-seed hidden split with `--seed N --split hidden`; its default output path is hidden/, outside data/ and outside the npm package.
- Refresh: Review yearly. Change the public seed only for a declared data version; generate hidden tasks with `--seed N --split hidden` and run them with `--tasks <path>`.
