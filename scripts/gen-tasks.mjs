import { mkdir, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

const seed = Number(option("--seed", "20261015"));
const split = option("--split", "public");
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");
if (!new Set(["public", "hidden"]).has(split)) throw new Error("--split must be public or hidden");
const output = option("--output", split === "public" ? "data/tasks.jsonl" : "data/tasks.hidden.jsonl");

function mulberry32(initial) {
  let state = initial >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const animals = [
  ["pelican", "pouch beak"], ["flamingo", "curved beak"], ["toucan", "large colorful beak"],
  ["stork", "long pointed beak"], ["heron", "long pointed beak"], ["duck", "flat beak"],
  ["goose", "orange beak"], ["parrot", "hooked beak"], ["penguin", "short beak"], ["swan", "orange beak"],
];
const vehicles = [
  "bicycle", "tandem bicycle", "cargo bicycle", "mountain bike",
  "road bicycle", "touring bicycle", "cruiser bicycle", "folding bicycle",
];
const templates = [
  (animal, vehicle) => `Draw an SVG of a ${animal} riding a ${vehicle}. Return only the SVG markup.`,
  (animal, vehicle) => `Create a self-contained SVG showing a ${animal} riding a ${vehicle}. Output only SVG.`,
  (animal, vehicle) => `Generate an SVG illustration: a ${animal} is riding a ${vehicle}. No prose or external images.`,
];

function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function referenceSvg(animal, vehicle, index) {
  const body = ["#f4f1de", "#cce3de", "#e8d7f1", "#d8e2dc"][index % 4];
  const wing = ["#81b29a", "#8ecae6", "#b8c0ff", "#90be6d"][index % 4];
  const frame = ["#3d405b", "#264653", "#6d597a", "#1d3557"][index % 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" role="img" aria-label="${animal} riding a ${vehicle}">
<rect width="640" height="420" fill="#edf6f9"/><path d="M0 365H640" stroke="#6b705c" stroke-width="8"/>
<circle cx="150" cy="320" r="72" fill="none" stroke="#222" stroke-width="12"/><circle cx="490" cy="320" r="72" fill="none" stroke="#222" stroke-width="12"/>
<circle cx="150" cy="320" r="7"/><circle cx="490" cy="320" r="7"/><path d="M150 320L255 315L335 220L405 320H255L320 260L490 320M335 220L455 205" fill="none" stroke="${frame}" stroke-width="13" stroke-linejoin="round"/>
<path d="M440 205L475 185M455 205L480 220" stroke="#222" stroke-width="10" stroke-linecap="round"/><path d="M320 260l-28 38m28-38 34 29" stroke="#222" stroke-width="8"/><circle cx="320" cy="260" r="13" fill="#f2cc8f"/>
<ellipse cx="315" cy="145" rx="92" ry="68" fill="${body}" stroke="#333" stroke-width="5"/><path d="M280 145q60-45 105 4q-52 58-105-4" fill="${wing}" stroke="#333" stroke-width="4"/>
<path d="M375 135q24-72 74-70" fill="none" stroke="${body}" stroke-width="35" stroke-linecap="round"/><circle cx="455" cy="62" r="43" fill="${body}" stroke="#333" stroke-width="5"/><circle cx="470" cy="51" r="5"/>
<path d="M486 65L590 82L486 99Z" fill="#f4a261" stroke="#9c6644" stroke-width="4"/><path d="M493 85q50 48 91 1" fill="#f6bd60" stroke="#9c6644" stroke-width="4"/>
<path d="M278 190Q264 240 292 292M352 194Q357 245 354 289" fill="none" stroke="#e9c46a" stroke-width="14" stroke-linecap="round"/><path d="M276 297l22 2M343 293l22-8" stroke="#333" stroke-width="7" stroke-linecap="round"/>
<path d="M230 112q-42-32-66-7q31 7 55 34" fill="${body}" stroke="#333" stroke-width="4"/>
</svg>`;
}

const random = mulberry32(seed);
const combinations = shuffle(animals.flatMap(([animal, feature]) => vehicles.map((vehicle) => ({ animal, feature, vehicle }))), random);
const canonical = { animal: "pelican", feature: "pouch beak", vehicle: "bicycle" };
const selected = [canonical, ...combinations.filter(({ animal, vehicle }) => animal !== "pelican" || vehicle !== "bicycle").slice(0, 29)];
const tasks = selected.map(({ animal, feature, vehicle }, index) => {
  const canonicalTask = index === 0;
  const prompt = canonicalTask ? "Generate an SVG of a pelican riding a bicycle." : templates[Math.floor(random() * templates.length)](animal, vehicle);
  return {
    id: canonicalTask ? `${split}-pelican-bicycle` : `${split}-${String(index + 1).padStart(2, "0")}-${animal.replaceAll(" ", "-")}-${vehicle.replaceAll(" ", "-")}`,
    kind: "single",
    prompt,
    expected: referenceSvg(animal, vehicle, index),
    metadata: {
      split, seed, source: canonicalTask ? "human-written-canonical" : "seeded-grid", animal, vehicle,
      requiredParts: ["svg root", "two wheels", "bicycle frame", "handlebars", "pedals", "bird body", feature, "two legs reaching the pedals"],
    },
  };
});

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks with seed ${seed} at ${output}`);
