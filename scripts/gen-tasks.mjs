import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

const PUBLIC_SEED = 20261015;
const split = option("--split", "public");
if (!new Set(["public", "hidden"]).has(split)) throw new Error("--split must be public or hidden");
const seed = Number(option("--seed", String(split === "public" ? PUBLIC_SEED : 8675309)));
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");
const output = option("--output", split === "public" ? "data/tasks.jsonl" : "hidden/tasks.jsonl");

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
const pick = (random, items) => items[Math.floor(random() * items.length)];

// Feature tables. `beak`, `neck`, `legs`, `body`, and `extras` become requiredParts
// entries and choose the reference geometry, so grading stays honest about what it checks.
const ANIMALS = {
  public: {
    pelican: { beak: "pouch beak", neck: "short neck", legs: "legs", body: "bird body", extras: [] },
    flamingo: { beak: "curved beak", neck: "long neck", legs: "long legs", body: "bird body", extras: [] },
    toucan: { beak: "large beak", neck: "short neck", legs: "legs", body: "bird body", extras: [] },
    stork: { beak: "long pointed beak", neck: "long neck", legs: "long legs", body: "bird body", extras: [] },
    heron: { beak: "long pointed beak", neck: "long neck", legs: "long legs", body: "bird body", extras: [] },
    duck: { beak: "flat beak", neck: "short neck", legs: "legs", body: "bird body", extras: [] },
    goose: { beak: "orange beak", neck: "long neck", legs: "legs", body: "bird body", extras: [] },
    parrot: { beak: "hooked beak", neck: "short neck", legs: "legs", body: "bird body", extras: ["tail feathers"] },
    penguin: { beak: "short beak", neck: "short neck", legs: "legs", body: "upright body", extras: [] },
    swan: { beak: "orange beak", neck: "long neck", legs: "legs", body: "bird body", extras: [] },
  },
  hidden: {
    owl: { beak: "small hooked beak", neck: "short neck", legs: "legs", body: "upright body", extras: [] },
    crane: { beak: "long pointed beak", neck: "long neck", legs: "long legs", body: "bird body", extras: [] },
    ibis: { beak: "thin curved beak", neck: "long neck", legs: "long legs", body: "bird body", extras: [] },
    puffin: { beak: "tall colourful beak", neck: "short neck", legs: "legs", body: "upright body", extras: [] },
    raven: { beak: "pointed beak", neck: "short neck", legs: "legs", body: "bird body", extras: ["tail feathers"] },
    seagull: { beak: "pointed beak", neck: "short neck", legs: "legs", body: "bird body", extras: ["tail feathers"] },
    kiwi: { beak: "thin curved beak", neck: "short neck", legs: "long legs", body: "upright body", extras: [] },
    ostrich: { beak: "short beak", neck: "long neck", legs: "long legs", body: "upright body", extras: [] },
    vulture: { beak: "hooked beak", neck: "long neck", legs: "legs", body: "bird body", extras: [] },
    magpie: { beak: "pointed beak", neck: "short neck", legs: "legs", body: "bird body", extras: ["tail feathers"] },
  },
};
const VEHICLES = {
  public: {
    "bicycle": { wheels: "two wheels", bars: "handlebars", extras: [], wheelbase: 340, wheelR: 66, tire: 12 },
    "tandem bicycle": { wheels: "two wheels", bars: "handlebars", extras: ["long wheelbase", "second saddle"], wheelbase: 430, wheelR: 55, tire: 10 },
    "cargo bicycle": { wheels: "two wheels", bars: "handlebars", extras: ["cargo box"], wheelbase: 350, wheelR: 62, tire: 12 },
    "mountain bike": { wheels: "two wheels", bars: "handlebars", extras: ["knobby tires"], wheelbase: 340, wheelR: 70, tire: 15 },
    "road bicycle": { wheels: "two wheels", bars: "drop handlebars", extras: [], wheelbase: 345, wheelR: 68, tire: 8 },
    "touring bicycle": { wheels: "two wheels", bars: "handlebars", extras: ["rear rack"], wheelbase: 350, wheelR: 66, tire: 10 },
    "cruiser bicycle": { wheels: "two wheels", bars: "swept handlebars", extras: [], wheelbase: 330, wheelR: 68, tire: 13 },
    "folding bicycle": { wheels: "two wheels", bars: "handlebars", extras: ["small wheels"], wheelbase: 290, wheelR: 46, tire: 10 },
  },
  hidden: {
    "electric bicycle": { wheels: "two wheels", bars: "handlebars", extras: ["battery pack"], wheelbase: 345, wheelR: 66, tire: 11 },
    "BMX bike": { wheels: "two wheels", bars: "handlebars", extras: ["small wheels"], wheelbase: 285, wheelR: 44, tire: 13 },
    "gravel bike": { wheels: "two wheels", bars: "drop handlebars", extras: [], wheelbase: 340, wheelR: 66, tire: 10 },
    "city bike": { wheels: "two wheels", bars: "swept handlebars", extras: ["rear rack"], wheelbase: 335, wheelR: 66, tire: 11 },
    "track bicycle": { wheels: "two wheels", bars: "drop handlebars", extras: [], wheelbase: 350, wheelR: 68, tire: 7 },
    "commuter bicycle": { wheels: "two wheels", bars: "handlebars", extras: ["rear rack"], wheelbase: 340, wheelR: 65, tire: 10 },
    "hybrid bicycle": { wheels: "two wheels", bars: "handlebars", extras: ["knobby tires"], wheelbase: 338, wheelR: 67, tire: 12 },
    "fat bike": { wheels: "two wheels", bars: "handlebars", extras: ["knobby tires"], wheelbase: 345, wheelR: 72, tire: 20 },
  },
};

const PUBLIC_TEMPLATES = [
  (animal, vehicle) => `Draw an SVG of a ${animal} riding a ${vehicle}. Reply with exactly one SVG image and nothing else: begin with <svg> and end with </svg>.`,
  (animal, vehicle) => `Create a self-contained SVG showing a ${animal} riding a ${vehicle}. Reply with exactly one SVG image and nothing else: begin with <svg> and end with </svg>.`,
  (animal, vehicle) => `Generate an SVG illustration: a ${animal} is riding a ${vehicle}. Reply with exactly one SVG image and nothing else: begin with <svg> and end with </svg>.`,
];
const HIDDEN_TEMPLATES = [
  (animal, vehicle) => `Sketch a ${animal} on a ${vehicle} as SVG markup. Reply with exactly one SVG image and nothing else: begin with <svg> and end with </svg>.`,
  (animal, vehicle) => `Produce one standalone SVG of a ${animal} riding a ${vehicle}. Reply with exactly one SVG image and nothing else: begin with <svg> and end with </svg>.`,
  (animal, vehicle) => `SVG answer only: show a ${animal} cycling on a ${vehicle}. Begin with <svg> and end with </svg>.`,
];

function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
const round = (value) => Math.round(value * 10) / 10;
const jitter = (random, amount) => round((random() - 0.5) * 2 * amount);

// Draws a bicycle whose wheels sit low on the canvas and whose frame, bars and
// pedals satisfy the structural checks the grader documents.
function bicycleSvg(spec, random) {
  const radius = spec.wheelR + jitter(random, 5);
  const wheelbase = spec.wheelbase + jitter(random, 16);
  const cy = 318 + jitter(random, 4);
  const rearX = round(320 - wheelbase / 2), frontX = round(320 + wheelbase / 2);
  const tire = spec.tire;
  const bbX = round(rearX + wheelbase * 0.42), bbY = round(cy - 22);
  const seatX = round(rearX + wheelbase * 0.36), seatY = round(cy - 78);
  const headX = round(frontX - wheelbase * 0.12), headY = round(cy - 96);
  const dark = "#22252b";
  const parts = [
    `<circle cx="${rearX}" cy="${cy}" r="${radius}" fill="none" stroke="${dark}" stroke-width="${tire}"/>`,
    `<circle cx="${frontX}" cy="${cy}" r="${radius}" fill="none" stroke="${dark}" stroke-width="${tire}"/>`,
    `<circle cx="${rearX}" cy="${cy}" r="7" fill="${dark}"/><circle cx="${frontX}" cy="${cy}" r="7" fill="${dark}"/>`,
    `<path d="M${rearX} ${cy}L${bbX} ${bbY}L${seatX} ${seatY}L${bbX} ${bbY}L${headX} ${headY}L${frontX} ${cy}M${seatX} ${seatY}L${seatX - 6} ${seatY - 14}" fill="none" stroke="FRAME" stroke-width="12" stroke-linejoin="round"/>`,
    `<ellipse cx="${seatX - 6}" cy="${seatY - 20}" rx="19" ry="7" fill="${dark}"/>`,
    `<path d="M${bbX} ${bbY}l-18 24m18-24 20 22" stroke="${dark}" stroke-width="8"/>`,
    `<circle cx="${bbX}" cy="${bbY}" r="12" fill="#f2cc8f"/>`,
  ];
  if (spec.extras.includes("knobby tires")) {
    parts.push(`<circle cx="${rearX}" cy="${cy}" r="${radius + 7}" fill="none" stroke="${dark}" stroke-width="6" stroke-dasharray="7 9"/>`);
    parts.push(`<circle cx="${frontX}" cy="${cy}" r="${radius + 7}" fill="none" stroke="${dark}" stroke-width="6" stroke-dasharray="7 9"/>`);
  }
  const barX = headX + jitter(random, 4), barY = headY - 24;
  if (spec.bars === "drop handlebars") parts.push(`<path d="M${headX} ${headY}L${barX} ${barY}" stroke="${dark}" stroke-width="9"/><path d="M${barX} ${barY}q24 4 24 26q0 16 -18 18" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>`);
  else if (spec.bars === "swept handlebars") parts.push(`<path d="M${headX} ${headY}L${barX} ${barY}M${barX} ${barY}q-40 -6 -52 18M${barX} ${barY}q34 -8 48 12" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>`);
  else parts.push(`<path d="M${headX} ${headY}L${barX} ${barY}M${barX - 14} ${barY - 10}l30 4m-30 -4 34 18" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>`);
  if (spec.extras.includes("second saddle")) parts.push(`<ellipse cx="${round(rearX + wheelbase * 0.62)}" cy="${seatY - 18}" rx="19" ry="7" fill="${dark}"/><path d="M${round(rearX + wheelbase * 0.62)} ${seatY - 12}L${round(rearX + wheelbase * 0.62)} ${seatY + 4}" stroke="${dark}" stroke-width="8"/>`);
  if (spec.extras.includes("cargo box")) parts.push(`<rect x="${frontX - 40}" y="${cy - radius - 58}" width="96" height="56" rx="6" fill="#b08968" stroke="#6b4f35" stroke-width="5"/>`);
  if (spec.extras.includes("rear rack")) parts.push(`<rect x="${rearX - 48}" y="${cy - radius - 14}" width="92" height="10" rx="4" fill="${dark}"/>`);
  if (spec.extras.includes("battery pack")) parts.push(`<rect x="${round(rearX + wheelbase * 0.28)}" y="${bbY - 66}" width="70" height="24" rx="6" fill="#495057"/>`);
  return { parts, wheels: { rearX, frontX, cy, radius }, bbX, bbY, seatY };
}

// Beak geometry lives ahead of the head centre (head always sits front-top of the body).
function beakSvg(style, head, colour) {
  const { hx, hy, hr } = head;
  const tipX = hx + hr;
  switch (style) {
    case "pouch beak": return `<path d="M${tipX - 6} ${hy - 6}L${hx + hr + 118} ${hy + 8}L${tipX - 6} ${hy + 16}Z" fill="${colour}" stroke="#9c6644" stroke-width="4"/><path d="M${tipX} ${hy + 14}q62 42 116 8q-52 52 -116 -8" fill="#f6bd60" stroke="#9c6644" stroke-width="4"/>`;
    case "curved beak": return `<path d="M${tipX - 4} ${hy - 2}q36 6 28 46q-26 -16 -28 -46" fill="${colour}"/>`;
    case "large beak": return `<path d="M${tipX - 8} ${hy - 12}Q${hx + hr + 150} ${hy - 14} ${hx + hr + 142} ${hy + 12}Q${hx + hr + 110} ${hy + 34} ${tipX - 8} ${hy + 18}Z" fill="${colour}" stroke="#9c6644" stroke-width="4"/>`;
    case "long pointed beak": return `<path d="M${tipX - 6} ${hy - 4}L${hx + hr + 148} ${hy + 6}L${tipX - 6} ${hy + 12}Z" fill="${colour}" stroke="#9c6644" stroke-width="3"/>`;
    case "flat beak": return `<path d="M${tipX - 6} ${hy}L${hx + hr + 62} ${hy + 6}L${tipX - 6} ${hy + 13}Z" fill="${colour}"/>`;
    case "orange beak": return `<path d="M${tipX - 6} ${hy - 2}L${hx + hr + 46} ${hy + 5}L${tipX - 6} ${hy + 12}Z" fill="${colour}"/>`;
    case "hooked beak": return `<path d="M${tipX - 4} ${hy - 8}q32 2 24 32q-26 -8 -24 -32" fill="${colour}"/>`;
    case "short beak": return `<path d="M${tipX - 4} ${hy}L${hx + hr + 34} ${hy + 5}L${tipX - 4} ${hy + 10}Z" fill="${colour}"/>`;
    case "small hooked beak": return `<path d="M${tipX - 2} ${hy - 4}q24 0 18 24q-20 -6 -18 -24" fill="${colour}"/>`;
    case "thin curved beak": return `<path d="M${tipX - 4} ${hy + 2}q74 8 86 46q-16 -44 -86 -52Z" fill="${colour}"/>`;
    case "tall colourful beak": return `<path d="M${tipX - 8} ${hy - 18}q46 6 40 52q-42 -8 -40 -52Z" fill="${colour}" stroke="#9c6644" stroke-width="3"/>`;
    case "pointed beak": return `<path d="M${tipX - 6} ${hy - 3}L${hx + hr + 84} ${hy + 6}L${tipX - 6} ${hy + 12}Z" fill="${colour}"/>`;
    default: throw new Error(`unknown beak style ${style}`);
  }
}

function birdSvg(spec, wheels, random, palette) {
  const dx = jitter(random, 14), dy = jitter(random, 10);
  const upright = spec.body === "upright body";
  const bx = round(310 + dx), bodyRy = upright ? 88 + jitter(random, 6) : 58 + jitter(random, 6);
  const bodyRx = upright ? 62 + jitter(random, 5) : 90 + jitter(random, 7);
  const bodyCy = round((upright ? 176 : 152) + dy);
  const longNeck = spec.neck === "long neck";
  const hx = round(bx + bodyRx + (longNeck ? 66 : 30)), hy = round(bodyCy - bodyRy - (longNeck ? 52 : 26)), hr = upright ? 34 : 38;
  const head = { hx, hy, hr };
  const parts = [`<ellipse cx="${bx}" cy="${bodyCy}" rx="${bodyRx}" ry="${bodyRy}" fill="${palette.body}" stroke="#33343a" stroke-width="5"/>`];
  if (!upright) parts.push(`<path d="M${bx - 34} ${bodyCy}q58 -44 104 2q-50 56 -104 -2" fill="${palette.wing}" stroke="#33343a" stroke-width="4"/>`);
  else parts.push(`<ellipse cx="${bx}" cy="${bodyCy + 8}" rx="${round(bodyRx * 0.62)}" ry="${round(bodyRy * 0.6)}" fill="${palette.belly}"/>`);
  if (spec.extras.includes("tail feathers")) parts.push(`<path d="M${bx - bodyRx + 8} ${bodyCy + 26}q-46 4 -64 44q48 -4 70 -28" fill="${palette.wing}" stroke="#33343a" stroke-width="4"/>`);
  if (longNeck) parts.push(`<path d="M${bx + bodyRx - 26} ${bodyCy - bodyRy + 22}q10 -60 ${hx - bx - bodyRx + 40} ${hy - bodyCy + bodyRy - 8}" fill="none" stroke="${palette.body}" stroke-width="30" stroke-linecap="round"/>`);
  parts.push(`<circle cx="${hx}" cy="${hy}" r="${hr}" fill="${palette.body}" stroke="#33343a" stroke-width="5"/>`);
  parts.push(`<circle cx="${hx + 14}" cy="${hy - 10}" r="5" fill="#22252b"/>`);
  parts.push(beakSvg(spec.beak, head, palette.beak));
  const legY = bodyCy + bodyRy - 6, pedalY = wheels.bbY - 2;
  const legStroke = spec.legs === "long legs" ? 6 : 13;
  const legSpread = upright ? 30 : 44;
  parts.push(`<path d="M${bx - legSpread} ${legY}Q${bx - legSpread - 8} ${round((legY + pedalY) / 2)} ${bx - legSpread + 10} ${pedalY}M${bx + legSpread - 14} ${legY + 4}Q${bx + legSpread - 4} ${round((legY + pedalY) / 2)} ${bx + legSpread + 12} ${pedalY}" fill="none" stroke="${palette.legs}" stroke-width="${legStroke}" stroke-linecap="round"/>`);
  parts.push(`<path d="M${bx - legSpread + 2} ${pedalY + 4}l24 2M${bx + legSpread + 4} ${pedalY + 2}l22 -6" stroke="#33343a" stroke-width="7" stroke-linecap="round"/>`);
  return parts;
}

function referenceSvg(animal, vehicle, index, random) {
  const aspect = ANIMALS.public[animal] ?? ANIMALS.hidden[animal];
  const vspec = VEHICLES.public[vehicle] ?? VEHICLES.hidden[vehicle];
  const bodies = ["#f4f1de", "#cce3de", "#e8d7f1", "#d8e2dc", "#ffe5d9", "#e9f5db"];
  const wings = ["#81b29a", "#8ecae6", "#b8c0ff", "#90be6d", "#ffb4a2", "#b7adcf"];
  const frames = ["#3d405b", "#264653", "#6d597a", "#1d3557", "#5f6c7b", "#7f5539"];
  const palette = {
    body: pick(random, bodies), wing: pick(random, wings), belly: "#fdf8ec",
    beak: pick(random, ["#f4a261", "#f6bd60", "#ee9b00", "#f4845f"]), legs: "#e9c46a",
  };
  const bike = bicycleSvg(vspec, random);
  const bird = birdSvg(aspect, bike, random, palette);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" role="img" aria-label="${animal} riding a ${vehicle}">
<rect width="640" height="420" fill="#edf6f9"/><path d="M0 368H640" stroke="#6b705c" stroke-width="8"/>
${bike.parts.join("\n").replaceAll("FRAME", pick(random, frames))}
${bird.join("\n")}
</svg>`;
}

const random = mulberry32(seed);
const animalTable = split === "public" ? ANIMALS.public : ANIMALS.hidden;
const vehicleTable = split === "public" ? VEHICLES.public : VEHICLES.hidden;
const templates = split === "public" ? PUBLIC_TEMPLATES : HIDDEN_TEMPLATES;
const combinations = shuffle(
  Object.keys(animalTable).flatMap((animal) => Object.keys(vehicleTable).map((vehicle) => ({ animal, vehicle }))),
  random,
);
const selected = split === "public"
  ? [{ animal: "pelican", vehicle: "bicycle" }, ...combinations.filter(({ animal, vehicle }) => animal !== "pelican" || vehicle !== "bicycle").slice(0, 29)]
  : combinations.slice(0, 30);
const tasks = selected.map(({ animal, vehicle }, index) => {
  const canonicalTask = split === "public" && index === 0;
  const aspect = animalTable[animal];
  const spec = vehicleTable[vehicle];
  const prompt = canonicalTask
    ? "Generate an SVG of a pelican riding a bicycle. Reply with exactly one SVG image and nothing else: begin with <svg> and end with </svg>."
    : templates[Math.floor(random() * templates.length)](animal, vehicle);
  const requiredParts = ["svg root", spec.wheels, "bicycle frame", spec.bars, "pedals", ...spec.extras, aspect.body, "bird head", aspect.beak, ...(aspect.neck === "long neck" ? ["long neck"] : []), ...(aspect.legs === "long legs" ? ["long legs"] : []), "legs reaching the pedals", ...aspect.extras];
  return {
    id: canonicalTask ? "public-pelican-bicycle" : `${split}-${String(index + 1).padStart(2, "0")}-${animal.replaceAll(" ", "-")}-${vehicle.replaceAll(" ", "-")}`,
    kind: "single",
    prompt,
    expected: referenceSvg(animal, vehicle, index, random),
    metadata: { split, seed, source: canonicalTask ? "human-written-canonical" : "seeded-grid", animal, vehicle, requiredParts },
  };
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks with seed ${seed} at ${output}`);
