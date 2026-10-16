// Prompt-only policy: a drawing built purely from what the prompt text states.
// It parses the part phrases out of the task prompt and lays out simple shapes
// with natural proportions — the way a model that follows the prompt would.
// The E2E runs it on every task to prove the benchmark is solvable from the
// prompt alone: it never reads task.expected or task.metadata.
//
// Everything is drawn as a fraction of the requested canvas, so the same
// prompt produces a correct drawing at any size. A ground line is included or
// omitted from a hash of the prompt text, which also proves that incidental
// decoration cannot move the score.

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

export function promptOnlySvg(prompt, canvasW = 1000, canvasH = 600) {
  const beak = named(prompt, BEAKS) ?? "pointed beak";
  const neck = named(prompt, PAIRS[0]) ?? "short neck";
  const posture = named(prompt, PAIRS[1]) ?? "level body";
  const bars = named(prompt, PAIRS[2]) ?? "handlebars";
  const wheelSize = named(prompt, PAIRS[3]) ?? "full-size wheels";
  const tires = named(prompt, PAIRS[4]) ?? "smooth tires";
  const flags = Object.fromEntries(FLAGS.map((flag) => [flag, prompt.toLowerCase().includes(flag)]));
  // A cheap deterministic coin toss per prompt: some drawings get a ground
  // line, some do not, and the score may not care either way.
  const withGround = [...prompt].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0;

  const W = canvasW, H = canvasH;
  const wheelR = wheelSize === "small wheels" ? H * 0.06 : H * 0.17;
  const wheelbase = W * 0.5;
  const axleY = H * 0.78;
  const rearX = W * 0.5 - wheelbase / 2, frontX = W * 0.5 + wheelbase / 2;
  const crankX = rearX + wheelbase * 0.42, crankY = axleY - wheelR * 0.3;
  const seatX = rearX + wheelbase * 0.34, seatY = axleY - H * 0.22;
  const steerX = frontX - wheelbase * 0.1, steerY = axleY - H * 0.24;
  const ink = "#2b2d33", warmBeak = "#ef8f3c", plumage = "#ccdbe4";
  const tyreWidth = tires === "fat tires" ? wheelR * 0.4 : tires === "knobby tires" ? wheelR * 0.3 : wheelR * 0.12;

  const upright = posture === "upright body";
  const bodyRx = upright ? W * 0.055 : W * 0.1;
  const bodyRy = upright ? bodyRx * 1.15 : bodyRx * 0.6;
  const bodyX = seatX + wheelbase * 0.06, bodyY = seatY - bodyRy * 1.15;
  const headR = bodyRx * 0.42;
  const longNeck = neck === "long neck";
  const headX = bodyX + bodyRx * (longNeck ? 1.4 : 0.95) + headR * (longNeck ? 0.6 : 0.2);
  const headY = bodyY - bodyRy - headR * (longNeck ? 1.6 : -0.25);
  // The scene height the grader measures runs from the head's top to the
  // wheels' bottoms; the saddle sits inside the lower band of that scene.
  const sceneH = axleY + wheelR - (headY - headR);
  const saddleY = axleY - sceneH * 0.2;

  const svg = [];
  if (withGround) svg.push(`<path d="M0 ${px(H * 0.92)}H${W}" fill="none" stroke="#77835f" stroke-width="6"/>`);
  const wheelAttrs = `fill="none" stroke="${ink}" stroke-width="${px(tyreWidth)}"${tires === "knobby tires" ? ` stroke-dasharray="${px(wheelR * 0.09)} ${px(wheelR * 0.12)}"` : ""}`;
  svg.push(`<circle cx="${px(rearX)}" cy="${px(axleY)}" r="${px(wheelR)}" ${wheelAttrs}/>`);
  svg.push(`<circle cx="${px(frontX)}" cy="${px(axleY)}" r="${px(wheelR)}" ${wheelAttrs}/>`);
  svg.push(`<circle cx="${px(rearX)}" cy="${px(axleY)}" r="${px(wheelR * 0.1)}" fill="${ink}"/>`);
  svg.push(`<circle cx="${px(frontX)}" cy="${px(axleY)}" r="${px(wheelR * 0.1)}" fill="${ink}"/>`);
  svg.push(`<path d="M${px(rearX)} ${px(axleY)}L${px(crankX)} ${px(crankY)}L${px(seatX)} ${px(seatY)}M${px(crankX)} ${px(crankY)}L${px(steerX)} ${px(steerY)}L${px(frontX)} ${px(axleY)}" fill="none" stroke="#4a4e69" stroke-width="${px(wheelR * 0.14)}" stroke-linejoin="round"/>`);
  svg.push(`<ellipse cx="${px(seatX)}" cy="${px(saddleY)}" rx="${px(wheelR * 0.3)}" ry="${px(wheelR * 0.09)}" fill="${ink}"/>`);
  svg.push(`<circle cx="${px(crankX)}" cy="${px(crankY)}" r="${px(wheelR * 0.18)}" fill="#8d6b4a"/>`);
  svg.push(`<path d="M${px(crankX)} ${px(crankY)}l${px(-wheelR * 0.2)} ${px(wheelR * 0.25)}M${px(crankX)} ${px(crankY)}l${px(wheelR * 0.22)} ${px(wheelR * 0.22)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.08)}"/>`);
  const barY = steerY - wheelR * 0.12;
  if (bars === "drop handlebars") {
    svg.push(`<path d="M${px(steerX)} ${px(steerY)}L${px(steerX)} ${px(barY)}q${px(wheelR * 0.22)} ${px(wheelR * 0.05)} ${px(wheelR * 0.22)} ${px(wheelR * 0.3)}q0 ${px(wheelR * 0.18)} ${px(-wheelR * 0.16)} ${px(wheelR * 0.2)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.09)}" stroke-linecap="round"/>`);
  } else if (bars === "swept handlebars") {
    svg.push(`<path d="M${px(steerX)} ${px(steerY)}L${px(steerX)} ${px(barY)}q${px(-wheelR * 0.55)} ${px(-wheelR * 0.06)} ${px(-wheelR * 0.75)} ${px(wheelR * 0.22)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.09)}" stroke-linecap="round"/>`);
  } else {
    svg.push(`<path d="M${px(steerX)} ${px(steerY)}L${px(steerX)} ${px(barY)}M${px(steerX - wheelR * 0.18)} ${px(barY - wheelR * 0.06)}L${px(steerX + wheelR * 0.2)} ${px(barY)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.09)}" stroke-linecap="round"/>`);
  }
  if (flags["second saddle"]) svg.push(`<ellipse cx="${px(rearX + wheelbase * 0.62)}" cy="${px(saddleY)}" rx="${px(wheelR * 0.3)}" ry="${px(wheelR * 0.09)}" fill="${ink}"/>`);
  if (flags["cargo box"]) svg.push(`<rect x="${px(frontX - wheelR * 0.7)}" y="${px(axleY - wheelR * 1.8)}" width="${px(wheelR * 1.3)}" height="${px(wheelR * 1.1)}" fill="#b08968" stroke="#6b4f35" stroke-width="4"/>`);
  if (flags["rear rack"]) svg.push(`<rect x="${px(rearX - wheelR * 1.1)}" y="${px(axleY - wheelR * 1.25)}" width="${px(wheelR * 0.9)}" height="${px(wheelR * 0.12)}" fill="${ink}"/>`);
  if (flags["battery pack"]) svg.push(`<rect x="${px(crankX - wheelR * 0.55)}" y="${px(crankY - wheelR * 0.75)}" width="${px(wheelR * 1.05)}" height="${px(wheelR * 0.3)}" fill="#495057"/>`);

  svg.push(`<ellipse cx="${px(bodyX)}" cy="${px(bodyY)}" rx="${px(bodyRx)}" ry="${px(bodyRy)}" fill="${plumage}" stroke="#3a3d45" stroke-width="4"/>`);
  svg.push(`<ellipse cx="${px(bodyX - bodyRx * 0.1)}" cy="${px(bodyY + bodyRy * 0.2)}" rx="${px(bodyRx * 0.6)}" ry="${px(bodyRy * 0.45)}" fill="#8fb7c7"/>`);
  if (flags["tail feathers"]) svg.push(`<path d="M${px(bodyX - bodyRx + 4)} ${px(bodyY + bodyRy * 0.4)}q${px(-bodyRx * 0.5)} ${px(bodyRy * 0.1)} ${px(-bodyRx * 0.7)} ${px(bodyRy * 0.7)}q${px(bodyRx * 0.5)} ${px(-bodyRy * 0.1)} ${px(bodyRx * 0.72)} ${px(-bodyRy * 0.4)}Z" fill="#8fb7c7" stroke="#3a3d45" stroke-width="3"/>`);
  if (longNeck) svg.push(`<path d="M${px(bodyX + bodyRx * 0.2)} ${px(bodyY - bodyRy * 0.9)}Q${px(headX - headR * 0.6)} ${px((bodyY + headY) / 2)} ${px(headX - headR * 0.3)} ${px(headY + headR * 0.9)}" fill="none" stroke="${plumage}" stroke-width="${px(headR * 0.8)}" stroke-linecap="round"/>`);
  svg.push(`<circle cx="${px(headX)}" cy="${px(headY)}" r="${px(headR)}" fill="${plumage}" stroke="#3a3d45" stroke-width="4"/>`);
  svg.push(`<circle cx="${px(headX + headR * 0.35)}" cy="${px(headY - headR * 0.3)}" r="${px(headR * 0.14)}" fill="${ink}"/>`);

  // Beak lengths and depths are multiples of the head width, exactly as the
  // prompt states them.
  const D = headR * 2, tipX = headX + headR * 0.9, tipY = headY;
  const beakShapes = {
    "pouch beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.08)}L${px(tipX + D * 1.4)} ${px(tipY + D * 0.08)}L${px(tipX)} ${px(tipY + D * 0.18)}Z" fill="${warmBeak}"/><ellipse cx="${px(tipX + D * 0.7)}" cy="${px(tipY + D * 0.4)}" rx="${px(D * 0.6)}" ry="${px(D * 0.3)}" fill="#f6bd60"/>`,
    "large beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.2)}L${px(tipX + D * 1.45)} ${px(tipY)}L${px(tipX)} ${px(tipY + D * 0.25)}Z" fill="${warmBeak}"/>`,
    "long pointed beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.06)}L${px(tipX + D * 1.8)} ${px(tipY + D * 0.04)}L${px(tipX)} ${px(tipY + D * 0.1)}Z" fill="${warmBeak}"/>`,
    "pointed beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.1)}L${px(tipX + D * 1.2)} ${px(tipY + D * 0.06)}L${px(tipX)} ${px(tipY + D * 0.2)}Z" fill="${warmBeak}"/>`,
    "flat beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.05)}L${px(tipX + D * 0.9)} ${px(tipY + D * 0.02)}L${px(tipX)} ${px(tipY + D * 0.12)}Z" fill="${warmBeak}"/>`,
    "thin curved beak": `<path d="M${px(tipX)} ${px(tipY)}q${px(D * 0.6)} ${px(D * 0.05)} ${px(D * 1.0)} ${px(D * 0.4)}q${px(-D * 0.2)} ${px(-D * 0.35)} ${px(-D)} ${px(-D * 0.45)}Z" fill="${warmBeak}"/>`,
    "hooked beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.1)}q${px(D * 0.35)} ${px(0)} ${px(D * 0.4)} ${px(D * 0.3)}q${px(-D * 0.3)} ${px(-D * 0.05)} ${px(-D * 0.4)} ${px(-D * 0.3)}Z" fill="${warmBeak}"/>`,
    "tall colourful beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.3)}L${px(tipX + D * 0.75)} ${px(tipY + D * 0.1)}L${px(tipX)} ${px(tipY + D * 0.4)}Z" fill="${warmBeak}"/>`,
    "short beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.05)}L${px(tipX + D * 0.4)} ${px(tipY + D * 0.04)}L${px(tipX)} ${px(tipY + D * 0.1)}Z" fill="${warmBeak}"/>`,
  };
  svg.push(beakShapes[beak]);

  const legStroke = flags["long legs"] ? headR * 0.2 : headR * 0.35;
  const legEnd = flags["long legs"] ? axleY + wheelR * 0.22 : crankY - wheelR * 0.05;
  svg.push(`<path d="M${px(bodyX - bodyRx * 0.4)} ${px(bodyY + bodyRy * 0.9)}L${px(crankX - wheelR * 0.15)} ${px(legEnd)}M${px(bodyX + bodyRx * 0.25)} ${px(bodyY + bodyRy * 0.9)}L${px(crankX + wheelR * 0.1)} ${px(legEnd)}" fill="none" stroke="#c9a227" stroke-width="${px(legStroke)}" stroke-linecap="round"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">\n${svg.join("\n")}\n</svg>`;
}
