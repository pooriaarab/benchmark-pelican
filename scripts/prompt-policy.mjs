// Prompt-only policy: a deliberately naive drawing built purely from what the
// prompt text states. It parses the part phrases out of the task prompt and
// lays out plain shapes with natural proportions — the way a model that only
// reads the prompt would draw. It never reads task.expected or task.metadata,
// and it shares no layout code, colours, or canvas with the task generator, so
// its score measures whether the prompts really carry enough information.
//
// Everything is a fraction of the requested canvas, so the same prompt draws
// correctly at any size. A seeded stream keyed on the prompt text and canvas
// size jitters what the prompt leaves open: leg bottoms land anywhere in
// [-0.2R, +0.3R] of the axle line, body and handlebar proportions wander, and
// the ground is drawn as nothing, a thin line, or a thin band.

const BEAKS = ["pouch beak", "long pointed beak", "thin curved beak", "tall colourful beak", "large beak", "pointed beak", "flat beak", "hooked beak", "short beak"];
const PAIRS = [
  ["long neck", "short neck"],
  ["upright body", "level body"],
  ["drop handlebars", "swept handlebars"],
  ["small wheels", "full-size wheels"],
  ["fat tires", "knobby tires", "smooth tires"],
];
const FLAGS = ["long legs", "tail feathers", "second saddle", "cargo box", "rear rack", "battery pack"];

function named(prompt, names) {
  const lower = prompt.toLowerCase();
  return names.find((name) => lower.includes(name)) ?? null;
}

// Scales every coordinate in an SVG fragment by s and translates by (dx, dy),
// including path data, so the same drawing can be rendered on any canvas.
const XATTR = new Set(["x", "x1", "x2", "cx"]);
const YATTR = new Set(["y", "y1", "y2", "cy"]);
const PATH_PAIRS = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
function transformPath(d, s, dx, dy) {
  const tokens = [...d.matchAll(/([a-zA-Z])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g)].map((m) => m[1] ?? m[2]);
  const out = [];
  let command = "", i = 0;
  const absolute = () => command === command.toUpperCase();
  while (i < tokens.length) {
    const token = tokens[i];
    if (/[a-zA-Z]/.test(token)) { command = token; out.push(token); i++; continue; }
    const name = command.toUpperCase();
    const count = PATH_PAIRS[name];
    if (!count) continue;
    const values = tokens.slice(i, i + count).map(Number);
    i += count;
    if (values.length < count) break;
    if (name === "A") {
      values[0] *= s; values[1] *= s;
      if (absolute()) { values[5] = values[5] * s + dx; values[6] = values[6] * s + dy; }
      else { values[5] *= s; values[6] *= s; }
    } else if (name === "H") values[0] = absolute() ? values[0] * s + dx : values[0] * s;
    else if (name === "V") values[0] = absolute() ? values[0] * s + dy : values[0] * s;
    else {
      for (let k = 0; k + 1 < values.length; k += 2) {
        if (absolute()) { values[k] = values[k] * s + dx; values[k + 1] = values[k + 1] * s + dy; }
        else { values[k] *= s; values[k + 1] *= s; }
      }
    }
    out.push(values.map((v) => String(Math.round(v * 10) / 10)).join(" "));
  }
  return out.join(" ");
}
export function transformSvg(svg, s = 1, dx = 0, dy = 0) {
  return svg
    .replace(/viewBox="([^"]+)"/, (_m, vb) => `viewBox="${vb.trim().split(/[ ,]+/).map(Number).map((v) => Math.round(v * s * 10) / 10).join(" ")}"`)
    .replace(/\bd="([^"]+)"/g, (_m, d) => `d="${transformPath(d, s, dx, dy)}"`)
    .replace(/\bpoints="([^"]+)"/g, (_m, pts) => `points="${pts.trim().split(/[ ,]+/).map(Number).map((v, idx) => Math.round((idx % 2 === 0 ? v * s + dx : v * s + dy) * 10) / 10).join(" ")}"`)
    .replace(/\b([a-zA-Z-]+)="(-?[\d.]+)"/g, (m, name, val) => {
      const v = Number(val);
      if (XATTR.has(name)) return `${name}="${Math.round((v * s + dx) * 10) / 10}"`;
      if (YATTR.has(name)) return `${name}="${Math.round((v * s + dy) * 10) / 10}"`;
      if (["r", "rx", "ry", "width", "height", "stroke-width", "font-size"].includes(name)) return `${name}="${Math.round(v * s * 10) / 10}"`;
      return m;
    });
}

const px = (v) => Math.round(v * 10) / 10;

// A small deterministic stream seeded on the prompt text and the canvas, so
// the jitter is stable per task but independent of the task generator's seed
// schedule.
function stream(prompt, w, h) {
  let state = (2166136261 ^ w ^ (h << 8)) >>> 0;
  for (const ch of prompt) { state ^= ch.codePointAt(0); state = Math.imul(state, 16777619) >>> 0; }
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
}

// Draws what the prompt literally asks for, on a blank side-view layout: two
// wheels low on the canvas, a simple frame between the hubs, and a bird
// perched over the middle. Every fixed number comes from the prompt's own
// words or an ordinary guess — nothing here knows what the grader measures
// beyond what the prompt states. What the prompt does not state gets a seeded
// jitter, so a lucky proportion cannot hide a missing check.
export function promptOnlySvg(prompt, canvasW = 1000, canvasH = 600) {
  const beak = named(prompt, BEAKS) ?? "pointed beak";
  const neck = named(prompt, PAIRS[0]) ?? "short neck";
  const posture = named(prompt, PAIRS[1]) ?? "level body";
  const bars = named(prompt, PAIRS[2]) ?? "handlebars";
  const wheelSize = named(prompt, PAIRS[3]) ?? "full-size wheels";
  const tires = named(prompt, PAIRS[4]) ?? "smooth tires";
  const flags = Object.fromEntries(FLAGS.map((flag) => [flag, prompt.toLowerCase().includes(flag)]));
  const rand = stream(prompt, canvasW, canvasH);
  const at = (lo, hi) => lo + (hi - lo) * rand();
  const ground = Math.floor(rand() * 3);

  const W = canvasW, H = canvasH;
  const rearX = W * at(0.22, 0.28), frontX = W * at(0.72, 0.78), axleY = H * at(0.72, 0.8);
  const wheelbase = frontX - rearX;
  // "Small wheels" are a radius under a seventh of the wheelbase, so draw
  // them at about a ninth; full-size wheels get ordinary proportions.
  const wheelR = wheelSize === "small wheels" ? wheelbase / at(8, 10) : wheelbase / at(4.5, 5.5);
  // Tire walls: the prompts state 0.28R for a rugged tread and a third for a
  // fat tire; a smooth tire is just a rim stroke.
  const tyreW = tires === "fat tires" ? wheelR * at(0.38, 0.5) : tires === "knobby tires" ? wheelR * at(0.3, 0.4) : wheelR * at(0.08, 0.15);
  const ink = "#33322e", warmBeak = "#f0a030", plumage = "#dde6ee", wingC = "#a8bfd0", legC = "#d9a94a";

  const crankX = W * at(0.47, 0.53), crankY = axleY - wheelR * at(0.1, 0.4);
  const seatX = rearX + wheelbase * at(0.3, 0.4), seatY = axleY - wheelR * at(1.4, 1.9);
  const headTubeX = frontX - wheelbase * at(0.1, 0.16), headTubeY = axleY - wheelR * at(1.8, 2.3);

  const upright = posture === "upright body";
  // "Taller than it is wide" and "wider than it is tall" are the only stated
  // body numbers; the sizes themselves are a guess, jittered per prompt.
  const bodyRx = (upright ? W * 0.05 : W * 0.09) * at(0.85, 1.2);
  const bodyRy = upright ? bodyRx * at(1.15, 1.5) : bodyRx * at(0.5, 0.75);
  const bodyX = W * at(0.38, 0.46), bodyY = axleY - wheelR * at(2.8, 3.6);
  const headR = Math.min(W * at(0.02, 0.028), bodyRx * 0.55);
  const longNeck = neck === "long neck";
  const headX = bodyX + bodyRx + headR * (longNeck ? at(1.8, 2.6) : at(0.3, 0.7));
  const headY = bodyY - bodyRy - headR * (longNeck ? at(1.5, 2.1) : at(0.2, 0.5));

  const svg = [];
  if (ground === 1) svg.push(`<line x1="0" y1="${px(axleY + wheelR + H * 0.04)}" x2="${W}" y2="${px(axleY + wheelR + H * 0.04)}" stroke="#9aa38f" stroke-width="${px(H * 0.008)}"/>`);
  if (ground === 2) svg.push(`<rect x="0" y="${px(axleY + wheelR + H * 0.03)}" width="${W}" height="${px(H * 0.035)}" fill="#cfd8c8"/>`);

  // Two equal wheels, then a plain diamond frame whose stroke runs hub to hub.
  svg.push(`<circle cx="${px(rearX)}" cy="${px(axleY)}" r="${px(wheelR)}" fill="none" stroke="${ink}" stroke-width="${px(tyreW)}"/>`);
  svg.push(`<circle cx="${px(frontX)}" cy="${px(axleY)}" r="${px(wheelR)}" fill="none" stroke="${ink}" stroke-width="${px(tyreW)}"/>`);
  if (tires === "knobby tires") {
    svg.push(`<circle cx="${px(rearX)}" cy="${px(axleY)}" r="${px(wheelR * 1.1)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.1)}" stroke-dasharray="${px(wheelR * 0.12)} ${px(wheelR * 0.12)}"/>`);
    svg.push(`<circle cx="${px(frontX)}" cy="${px(axleY)}" r="${px(wheelR * 1.1)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.1)}" stroke-dasharray="${px(wheelR * 0.12)} ${px(wheelR * 0.12)}"/>`);
  }
  svg.push(`<path d="M${px(rearX)} ${px(axleY)}L${px(crankX)} ${px(crankY)}L${px(frontX)} ${px(axleY)}M${px(crankX)} ${px(crankY)}L${px(seatX)} ${px(seatY)}M${px(headTubeX)} ${px(headTubeY)}L${px(frontX)} ${px(axleY)}M${px(headTubeX)} ${px(headTubeY)}L${px(crankX)} ${px(crankY)}" fill="none" stroke="#5a6472" stroke-width="${px(wheelR * 0.14)}" stroke-linejoin="round"/>`);
  // Saddles: small flat seats above the frame line.
  svg.push(`<ellipse cx="${px(seatX)}" cy="${px(seatY - wheelR * 0.15)}" rx="${px(wheelR * 0.4)}" ry="${px(wheelR * 0.12)}" fill="${ink}"/>`);
  if (flags["second saddle"]) svg.push(`<ellipse cx="${px(rearX + wheelbase * at(0.62, 0.72))}" cy="${px(seatY - wheelR * 0.15)}" rx="${px(wheelR * 0.4)}" ry="${px(wheelR * 0.12)}" fill="${ink}"/>`);
  // A small crank and pedals between the wheels near axle height.
  svg.push(`<circle cx="${px(crankX)}" cy="${px(crankY)}" r="${px(wheelR * 0.18)}" fill="${ink}"/>`);
  svg.push(`<path d="M${px(crankX)} ${px(crankY)}l${px(-wheelR * 0.3)} ${px(wheelR * 0.35)}M${px(crankX)} ${px(crankY)}l${px(wheelR * 0.3)} ${px(wheelR * 0.3)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.08)}"/>`);
  // Handlebars above the front wheel, inside the band the prompt states.
  const barTopX = headTubeX + W * at(-0.01, 0.02), barTopY = headTubeY - wheelR * at(0.25, 0.5);
  if (bars === "drop handlebars") {
    svg.push(`<path d="M${px(headTubeX)} ${px(headTubeY)}L${px(barTopX)} ${px(barTopY)}q${px(wheelR * 0.15)} ${px(wheelR * 0.05)} ${px(wheelR * 0.15)} ${px(wheelR * 0.35)}q0 ${px(wheelR * 0.16)} ${px(-wheelR * 0.16)} ${px(wheelR * 0.18)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.09)}" stroke-linecap="round"/>`);
  } else if (bars === "swept handlebars") {
    svg.push(`<path d="M${px(headTubeX)} ${px(headTubeY)}L${px(barTopX)} ${px(barTopY)}q${px(-wheelR * at(0.5, 0.7))} ${px(-wheelR * 0.05)} ${px(-wheelR * at(0.7, 0.85))} ${px(wheelR * 0.22)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.09)}" stroke-linecap="round"/>`);
  } else {
    svg.push(`<path d="M${px(headTubeX)} ${px(headTubeY)}L${px(barTopX)} ${px(barTopY)}M${px(barTopX - wheelR * at(0.3, 0.4))} ${px(barTopY - wheelR * at(0.1, 0.2))}L${px(barTopX + wheelR * at(0.35, 0.45))} ${px(barTopY + wheelR * at(0.1, 0.2))}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.09)}" stroke-linecap="round"/>`);
  }
  if (flags["cargo box"]) svg.push(`<rect x="${px(frontX - wheelR * 0.75)}" y="${px(axleY - wheelR * 2.3)}" width="${px(wheelR * 1.5)}" height="${px(wheelR * 1.1)}" fill="#b08968" stroke="#6b4f35" stroke-width="${px(wheelR * 0.06)}"/>`);
  if (flags["rear rack"]) svg.push(`<rect x="${px(rearX - wheelR * 0.65)}" y="${px(axleY - wheelR * 1.25)}" width="${px(wheelR * 1.3)}" height="${px(wheelR * 0.12)}" fill="${ink}"/>`);
  if (flags["battery pack"]) svg.push(`<rect x="${px(rearX + wheelbase * 0.3)}" y="${px(axleY - wheelR * 1.2)}" width="${px(wheelR * 1.0)}" height="${px(wheelR * 0.4)}" fill="#495057"/>`);

  // The bird: a body, a head ahead of it, an optional neck bridge, a warm
  // beak sized in head widths exactly as the prompt states, legs to the
  // pedals, and tail feathers when named.
  svg.push(`<ellipse cx="${px(bodyX)}" cy="${px(bodyY)}" rx="${px(bodyRx)}" ry="${px(bodyRy)}" fill="${plumage}" stroke="#44464e" stroke-width="${px(wheelR * 0.05)}"/>`);
  svg.push(`<ellipse cx="${px(bodyX - bodyRx * 0.1)}" cy="${px(bodyY + bodyRy * 0.15)}" rx="${px(bodyRx * 0.55)}" ry="${px(bodyRy * 0.45)}" fill="${wingC}"/>`);
  // "A fan of feathers taller than 0.4 times the wheel radius" — draw a
  // plain triangle fan about 0.7R tall trailing off the body's rear.
  if (flags["tail feathers"]) svg.push(`<path d="M${px(bodyX - bodyRx + W * 0.006)} ${px(bodyY + bodyRy * 0.1)}L${px(bodyX - bodyRx - wheelR * at(0.8, 1.0))} ${px(bodyY + bodyRy * 0.15 + wheelR * at(0.6, 0.75))}L${px(bodyX - bodyRx - wheelR * 0.15)} ${px(bodyY + bodyRy * 0.35)}Z" fill="${wingC}" stroke="#44464e" stroke-width="${px(wheelR * 0.04)}"/>`);
  // A plain straight neck bridging chest and head: a curved stroke over the
  // front wheel could read as swept or drop bars, so keep it straight.
  if (longNeck) svg.push(`<path d="M${px(bodyX + bodyRx * 0.2)} ${px(bodyY + bodyRy * 0.2)}L${px(headX - headR * 0.4)} ${px(headY + headR * 0.9)}" fill="none" stroke="${plumage}" stroke-width="${px(headR * 0.8)}" stroke-linecap="round"/>`);
  svg.push(`<circle cx="${px(headX)}" cy="${px(headY)}" r="${px(headR)}" fill="${plumage}" stroke="#44464e" stroke-width="${px(wheelR * 0.05)}"/>`);
  svg.push(`<circle cx="${px(headX + headR * 0.3)}" cy="${px(headY - headR * 0.3)}" r="${px(headR * 0.2)}" fill="${ink}"/>`);

  // Beak lengths and depths are multiples of the head width D, the way the
  // prompts state them. Every beak starts inside the head it hangs from.
  const D = headR * 2, tipX = headX + headR * 0.9, tipY = headY;
  const tri = (len, top, bottom) => `<path d="M${px(tipX)} ${px(tipY - D * top)}L${px(tipX + D * len)} ${px(tipY + D * (top + bottom) * 0.5)}L${px(tipX)} ${px(tipY + D * bottom)}Z" fill="${warmBeak}"/>`;
  const beakShapes = {
    "pouch beak": `${tri(0.9, 0.08, 0.18)}<ellipse cx="${px(tipX + D * 0.4)}" cy="${px(tipY + D * 0.45)}" rx="${px(D * 0.45)}" ry="${px(D * 0.25)}" fill="#f6bd60"/>`,
    "large beak": tri(1.4, 0.2, 0.25),
    "long pointed beak": tri(1.8, 0.05, 0.09),
    "pointed beak": tri(1.0, 0.12, 0.18),
    "flat beak": tri(0.85, 0.04, 0.07),
    "thin curved beak": `<path d="M${px(tipX)} ${px(tipY)}q${px(D * 0.6)} ${px(D * 0.05)} ${px(D * 1.0)} ${px(D * 0.4)}q${px(-D * 0.2)} ${px(-D * 0.35)} ${px(-D)} ${px(-D * 0.45)}Z" fill="${warmBeak}"/>`,
    "hooked beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.1)}q${px(D * 0.35)} ${px(0)} ${px(D * 0.4)} ${px(D * 0.3)}q${px(-D * 0.3)} ${px(-D * 0.05)} ${px(-D * 0.4)} ${px(-D * 0.3)}Z" fill="${warmBeak}"/>`,
    "tall colourful beak": tri(0.9, 0.32, 0.33),
    "short beak": tri(0.4, 0.05, 0.1),
  };
  svg.push(beakShapes[beak]);

  // Legs run from under the body to the pedals near axle height. The prompt
  // does not say where the foot lands, so the bottom jitters anywhere in
  // [-0.2R, +0.3R] of the axle line; a long-legged wader dangles at least
  // half a wheel radius below it, as the prompt states.
  const legTopY = bodyY + bodyRy * at(0.55, 0.8);
  const legEndY = flags["long legs"] ? axleY + wheelR * at(0.6, 0.75) : axleY + wheelR * at(-0.2, 0.3);
  const legW = flags["long legs"] ? wheelR * at(0.05, 0.08) : wheelR * at(0.08, 0.13);
  const legFootX = (side) => px(Math.min(crankX + side * wheelR * at(0.05, 0.25), bodyX + bodyRx + wheelR * 0.5));
  svg.push(`<path d="M${px(bodyX - bodyRx * 0.4)} ${px(legTopY)}L${legFootX(-1)} ${px(legEndY)}M${px(bodyX + bodyRx * 0.3)} ${px(legTopY)}L${legFootX(1)} ${px(legEndY)}" fill="none" stroke="${legC}" stroke-width="${px(legW)}" stroke-linecap="round"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">\n${svg.join("\n")}\n</svg>`;
}
