import { readFile } from "node:fs/promises";
import { defineBenchmark, type Task } from "benchmark-core";
import { gradeSvg } from "./svg-grader.js";

async function loadTasks(): Promise<Task[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as Task);
}
export const benchmark = defineBenchmark({
  id: "benchmark-pelican", name: "Pelican Bicycle SVG", tagline: "Can a model draw a bird riding a bicycle in safe, plausible SVG?", tags: ["viral", "silly"], category: "multimodal",
  // benchmark-core 0.1 types saturation as numeric; the family index schema also permits "unknown".
  whatItMeasures: "Structural SVG drawing: safe markup, bicycle geometry, bird anatomy, spatial arrangement, and useful canvas coverage.", version: "0.1.0", status: "alpha", saturation: "unknown" as never, loadTasks,
  grade: (_task, submission) => gradeSvg(submission.answer),
  provenance: [
    {
      name: "Canonical pelican prompt", kind: "human-written", url: "https://github.com/pooriaarab/benchmark-pelican/blob/main/scripts/gen-tasks.mjs",
      licence: "CC0-1.0", howToGet: "Read the canonical task in scripts/gen-tasks.mjs, then run `npm run generate:tasks`.", retrievedAt: "2026-10-15T00:00:00.000Z",
      contaminationNotes: "The canonical prompt is public and widely discussed. It tests a known request, not a secret item.", refresh: "Keep the canonical prompt fixed so runs remain comparable.",
    },
    {
      name: "Seeded animal and bicycle grid", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-pelican/blob/main/scripts/gen-tasks.mjs",
      licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.", retrievedAt: "2026-10-15T00:00:00.000Z",
      contaminationNotes: "Public seed 20261015 has a 2026-10-15 cutoff. Generate a private-seed hidden split and keep it outside the repository and npm package.",
      refresh: "Review yearly. Change the public seed only for a declared data version; generate hidden tasks with `--seed N --split hidden`.",
    },
  ],
  gradingMethod: "Dependency-free structural SVG scan with weighted safety, geometry, required-part, complexity, and coverage checks.",
});
