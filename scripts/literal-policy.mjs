// Literal-number policy — the independent evidence cited in the docs. Reads
// ONLY the task prompt text and draws exactly the numbers it states, at face
// value plus a small seeded slack: a tail the prompt calls "taller than 0.4
// times the wheel radius" is drawn 0.42-0.5R tall, pedals sit on the axle
// line, tire strokes sit just over their stated minimums. It never reads
// task.expected or task.metadata and shares no code, colours, or layout
// constants with the generator or prompt-policy.mjs.

const BEAK_STYLES = ["pouch beak", "long pointed beak", "thin curved beak", "tall colourful beak", "large beak", "pointed beak", "flat beak", "hooked beak", "short beak"];
const PICKS = [["long neck", "short neck"], ["upright body", "level body"], ["drop handlebars", "swept handlebars"], ["small wheels", "full-size wheels"], ["fat tires", "knobby tires", "smooth tires"]];
const EXTRAS = ["long legs", "tail feathers", "second saddle", "cargo box", "rear rack", "battery pack"];
const find = (prompt, names) => names.find((name) => prompt.toLowerCase().includes(name)) ?? null;

// A deterministic stream seeded on the prompt text and canvas size only.
function seeded(prompt, w, h) {
  let s = (3735928559 ^ (w * 3) ^ h) >>> 0;
  for (const ch of prompt) s = Math.imul(s ^ ch.codePointAt(0), 2654435761) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const f = (v) => Math.round(v * 10) / 10;

export function literalPolicySvg(prompt, canvasW = 1000, canvasH = 600) {
  const beak = find(prompt, BEAK_STYLES) ?? "pointed beak";
  const [neck, posture, bars, wheelSize] = PICKS.map((names) => find(prompt, names));
  const tires = find(prompt, PICKS[4]) ?? "smooth tires";
  const wants = Object.fromEntries(EXTRAS.map((name) => [name, prompt.toLowerCase().includes(name)]));
  const rnd = seeded(prompt, canvasW, canvasH);
  const between = (lo, hi) => lo + (hi - lo) * rnd();

  const W = canvasW, H = canvasH;
  const rearX = W * between(0.24, 0.3), frontX = W * between(0.7, 0.76), axleY = H * between(0.74, 0.8);
  const wb = frontX - rearX;
  // "Radius under a seventh of the distance between the axles" -> WB/8; tire
  // strokes at the stated minimums: knobby 0.28R, fat a third, smooth thin.
  const R = wheelSize === "small wheels" ? wb / between(7.6, 8.6) : wb / between(4.6, 5.4);
  const tireW = tires === "fat tires" ? R * between(0.34, 0.42) : tires === "knobby tires" ? R * between(0.29, 0.34) : R * between(0.09, 0.14);
  const ink = "#2e2f33", orange = "#e8901e", pale = "#e6edf3", wing = "#9fbdd4", leg = "#c8963e";
  const crankX = W * between(0.46, 0.54), crankY = axleY - R * between(0.05, 0.25);
  const seatX = rearX + wb * between(0.3, 0.4), seatY = axleY - R * between(1.3, 1.7);
  const headTubeX = frontX - wb * between(0.09, 0.15), headTubeY = axleY - R * between(1.7, 2.1);
  const barX = headTubeX + W * between(-0.01, 0.01), barY = headTubeY - R * between(0.3, 0.55);
  const upright = posture === "upright body";
  const bodyRx = upright ? R * between(0.75, 0.9) : R * between(1.15, 1.45);
  const bodyRy = upright ? bodyRx * between(1.05, 1.3) : bodyRx * between(0.5, 0.7);
  const bodyX = W * between(0.4, 0.48), bodyY = axleY - R * between(2.5, 3.1);
  const headR = R * between(0.36, 0.44), longNeck = neck === "long neck";
  const headX = bodyX + bodyRx + headR * (longNeck ? between(1.7, 2.4) : between(0.4, 0.8));
  const headY = bodyY - bodyRy - headR * (longNeck ? between(1.4, 2.0) : between(0.3, 0.6));

  // Wheels joined hub to hub by a diamond frame, a small flat saddle above
  // the frame line, and a crank hub between the wheels at axle height.
  const svg = [
    `<circle cx="${f(rearX)}" cy="${f(axleY)}" r="${f(R)}" fill="none" stroke="${ink}" stroke-width="${f(tireW)}"/>`,
    `<circle cx="${f(frontX)}" cy="${f(axleY)}" r="${f(R)}" fill="none" stroke="${ink}" stroke-width="${f(tireW)}"/>`,
    `<path d="M${f(rearX)} ${f(axleY)}L${f(crankX)} ${f(crankY)}L${f(frontX)} ${f(axleY)}M${f(crankX)} ${f(crankY)}L${f(seatX)} ${f(seatY)}M${f(headTubeX)} ${f(headTubeY)}L${f(frontX)} ${f(axleY)}M${f(headTubeX)} ${f(headTubeY)}L${f(crankX)} ${f(crankY)}" fill="none" stroke="#4d5a68" stroke-width="${f(R * 0.13)}" stroke-linejoin="round"/>`,
    `<ellipse cx="${f(seatX)}" cy="${f(seatY - R * 0.18)}" rx="${f(R * 0.38)}" ry="${f(R * 0.1)}" fill="${ink}"/>`,
    `<circle cx="${f(crankX)}" cy="${f(crankY)}" r="${f(R * 0.2)}" fill="${ink}"/>`,
    `<path d="M${f(crankX)} ${f(crankY)}l${f(-R * 0.3)} ${f(R * 0.3)}M${f(crankX)} ${f(crankY)}l${f(R * 0.3)} ${f(R * 0.28)}" fill="none" stroke="${ink}" stroke-width="${f(R * 0.08)}"/>`,
  ];
  if (wants["second saddle"]) svg.push(`<ellipse cx="${f(rearX + wb * between(0.6, 0.72))}" cy="${f(seatY - R * 0.18)}" rx="${f(R * 0.36)}" ry="${f(R * 0.1)}" fill="${ink}"/>`);
  // Handlebars in the stated band over the front wheel: a drop bar is one
  // curved stroke taller than wide, a swept bar curves back toward the rider.
  if (bars === "drop handlebars") svg.push(`<path d="M${f(headTubeX)} ${f(headTubeY)}L${f(barX)} ${f(barY)}q${f(R * 0.18)} ${f(R * 0.08)} ${f(R * 0.16)} ${f(R * 0.42)}q${f(-R * 0.02)} ${f(R * 0.16)} ${f(-R * 0.2)} ${f(R * 0.18)}" fill="none" stroke="${ink}" stroke-width="${f(R * 0.09)}" stroke-linecap="round"/>`);
  else if (bars === "swept handlebars") svg.push(`<path d="M${f(headTubeX)} ${f(headTubeY)}L${f(barX)} ${f(barY)}M${f(barX)} ${f(barY)}q${f(-R * between(0.55, 0.7))} ${f(-R * 0.06)} ${f(-R * between(0.75, 0.9))} ${f(R * 0.24)}" fill="none" stroke="${ink}" stroke-width="${f(R * 0.09)}" stroke-linecap="round"/>`);
  else svg.push(`<path d="M${f(headTubeX)} ${f(headTubeY)}L${f(barX)} ${f(barY)}M${f(barX - R * 0.35)} ${f(barY - R * 0.12)}L${f(barX + R * 0.4)} ${f(barY + R * 0.12)}" fill="none" stroke="${ink}" stroke-width="${f(R * 0.09)}" stroke-linecap="round"/>`);
  if (wants["cargo box"]) svg.push(`<rect x="${f(frontX - R * 0.7)}" y="${f(axleY - R * 2.2)}" width="${f(R * 1.4)}" height="${f(R * 1.0)}" fill="#b0855b" stroke="#5e4530" stroke-width="${f(R * 0.06)}"/>`);
  if (wants["rear rack"]) svg.push(`<rect x="${f(rearX - R * 0.62)}" y="${f(axleY - R * 1.3)}" width="${f(R * 1.25)}" height="${f(R * 0.11)}" fill="${ink}"/>`);
  if (wants["battery pack"]) svg.push(`<rect x="${f(rearX + wb * 0.32)}" y="${f(axleY - R * 1.35)}" width="${f(R * 1.05)}" height="${f(R * 0.42)}" fill="#454c55"/>`);
  // The bird: filled body and head, a filled warm beak sized in head widths
  // exactly as the prompt states, legs to the pedals, a 0.42-0.5R tail fan.
  svg.push(`<ellipse cx="${f(bodyX)}" cy="${f(bodyY)}" rx="${f(bodyRx)}" ry="${f(bodyRy)}" fill="${pale}" stroke="#3a3f4a" stroke-width="${f(R * 0.05)}"/>`);
  if (wants["tail feathers"]) {
    const tailH = R * between(0.42, 0.5), tailX = bodyX - bodyRx + W * 0.004, tailY = bodyY + bodyRy * between(0.05, 0.2);
    svg.push(`<path d="M${f(tailX)} ${f(tailY)}L${f(tailX - R * between(0.45, 0.6))} ${f(tailY + tailH)}L${f(tailX - R * 0.1)} ${f(tailY + tailH * 0.55)}Z" fill="${wing}" stroke="#3a3f4a" stroke-width="${f(R * 0.04)}"/>`);
  }
  if (longNeck) svg.push(`<path d="M${f(bodyX + bodyRx * 0.3)} ${f(bodyY - bodyRy * 0.2)}L${f(headX - headR * 0.5)} ${f(headY + headR * 0.8)}" fill="none" stroke="${pale}" stroke-width="${f(headR * 0.8)}" stroke-linecap="round"/>`);
  svg.push(`<circle cx="${f(headX)}" cy="${f(headY)}" r="${f(headR)}" fill="${pale}" stroke="#3a3f4a" stroke-width="${f(R * 0.05)}"/>`);
  svg.push(`<circle cx="${f(headX + headR * 0.35)}" cy="${f(headY - headR * 0.3)}" r="${f(headR * 0.18)}" fill="${ink}"/>`);
  const D = headR * 2, tipX = headX + headR * 0.85, tipY = headY;
  const tri = (len, rise, fall) => `<path d="M${f(tipX)} ${f(tipY - D * rise)}L${f(tipX + D * len)} ${f(tipY + D * (fall - rise) * 0.5)}L${f(tipX)} ${f(tipY + D * fall)}Z" fill="${orange}"/>`;
  svg.push({
    "pouch beak": `${tri(0.95, 0.1, 0.2)}<ellipse cx="${f(tipX + D * 0.45)}" cy="${f(tipY + D * 0.42)}" rx="${f(D * 0.42)}" ry="${f(D * 0.24)}" fill="#f0b456"/>`,
    "large beak": tri(between(1.3, 1.45), 0.18, 0.22),
    "long pointed beak": tri(between(1.65, 1.8), 0.05, 0.1),
    "pointed beak": tri(between(0.9, 1.0), 0.1, 0.16),
    "flat beak": tri(between(0.8, 0.95), 0.04, 0.08),
    "thin curved beak": `<path d="M${f(tipX)} ${f(tipY - D * 0.04)}q${f(D * 0.55)} ${f(D * 0.06)} ${f(D * between(0.9, 1.0))} ${f(D * 0.42)}q${f(-D * 0.18)} ${f(-D * 0.38)} ${f(-D * 0.95)} ${f(-D * 0.42)}Z" fill="${orange}"/>`,
    "hooked beak": `<path d="M${f(tipX)} ${f(tipY - D * 0.08)}q${f(D * 0.3)} ${f(0)} ${f(D * 0.34)} ${f(D * 0.28)}q${f(-D * 0.28)} ${f(-D * 0.04)} ${f(-D * between(0.55, 0.7))} ${f(-D * 0.26)}Z" fill="${orange}"/>`,
    "tall colourful beak": tri(between(0.8, 0.95), 0.3, 0.32),
    "short beak": tri(between(0.35, 0.45), 0.05, 0.09),
  }[beak]);
  // Legs reach the pedals "near axle height"; a wader's legs dangle at least
  // half a wheel radius below the axles, as the prompt states.
  const legTopY = bodyY + bodyRy * between(0.5, 0.75);
  const legEndY = wants["long legs"] ? axleY + R * between(0.55, 0.7) : axleY + R * between(-0.15, 0.25);
  const legW = wants["long legs"] ? R * between(0.05, 0.08) : R * between(0.09, 0.13);
  const foot = (side) => f(Math.min(crankX + side * R * between(0.1, 0.3), bodyX + bodyRx + R * 0.4));
  svg.push(`<path d="M${f(bodyX - bodyRx * 0.45)} ${f(legTopY)}L${foot(-1)} ${f(legEndY)}M${f(bodyX + bodyRx * 0.35)} ${f(legTopY)}L${foot(1)} ${f(legEndY)}" fill="none" stroke="${leg}" stroke-width="${f(legW)}" stroke-linecap="round"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">\n${svg.join("\n")}\n</svg>`;
}
