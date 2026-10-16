// Prompt-only policy: a deliberately naive drawing built purely from what the
// prompt text states. It parses the part phrases out of the task prompt and
// lays out plain shapes with natural proportions — the way a model that only
// reads the prompt would draw. It never reads task.expected or task.metadata,
// and it shares no layout code, colours, or canvas with the task generator, so
// its score measures whether the prompts really carry enough information.
//
// Everything is a fraction of the requested canvas, so the same prompt draws
// correctly at any size. A ground line is included or omitted from a hash of
// the prompt text, which also proves incidental decoration cannot move the
// score.

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

// Draws what the prompt literally asks for: a generic bicycle in side view
// with a generic bird perched over the seat, each named part rendered as the
// simplest shape that matches the stated description.
export function promptOnlySvg(prompt, canvasW = 1000, canvasH = 600) {
  const beak = named(prompt, BEAKS) ?? "pointed beak";
  const neck = named(prompt, PAIRS[0]) ?? "short neck";
  const posture = named(prompt, PAIRS[1]) ?? "level body";
  const bars = named(prompt, PAIRS[2]) ?? "handlebars";
  const wheelSize = named(prompt, PAIRS[3]) ?? "full-size wheels";
  const tires = named(prompt, PAIRS[4]) ?? "smooth tires";
  const flags = Object.fromEntries(FLAGS.map((flag) => [flag, prompt.toLowerCase().includes(flag)]));
  const withGround = [...prompt].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0;

  const W = canvasW, H = canvasH;
  const wheelR = wheelSize === "small wheels" ? H * 0.07 : H * 0.145;
  const axleY = H * 0.75;
  const rearX = W * 0.28, frontX = W * 0.72;
  const crankX = W * 0.47, crankY = H * 0.70;
  const seatX = W * 0.40, seatY = H * 0.585;
  const headTubeX = W * 0.645, headTubeY = H * 0.50;
  const ink = "#33322e", warmBeak = "#ee9b00", plumage = "#dfe7ee", wingC = "#9db8c9", legC = "#e9c46a";
  const tyreW = tires === "fat tires" ? wheelR * 0.36 : tires === "knobby tires" ? wheelR * 0.30 : wheelR * 0.10;

  const upright = posture === "upright body";
  const bodyRx = upright ? W * 0.055 : W * 0.10;
  const bodyRy = upright ? H * 0.11 : H * 0.055;
  const bodyX = W * 0.44, bodyY = H * 0.35;
  const headR = W * 0.028;
  const longNeck = neck === "long neck";
  const headX = upright
    ? bodyX + bodyRx * 0.5 + headR * (longNeck ? 1.6 : 0.4)
    : bodyX + bodyRx * 0.95 + headR * (longNeck ? 1.8 : 0.5);
  const headY = upright
    ? bodyY - bodyRy - headR * (longNeck ? 1.9 : 0.5)
    : bodyY - bodyRy - headR * (longNeck ? 1.7 : -0.3);

  const svg = [];
  if (withGround) svg.push(`<path d="M0 ${px(H * 0.92)}H${W}" fill="none" stroke="#8a937b" stroke-width="5"/>`);
  svg.push(`<circle cx="${px(rearX)}" cy="${px(axleY)}" r="${px(wheelR)}" fill="none" stroke="${ink}" stroke-width="${px(tyreW)}"/>`);
  svg.push(`<circle cx="${px(frontX)}" cy="${px(axleY)}" r="${px(wheelR)}" fill="none" stroke="${ink}" stroke-width="${px(tyreW)}"/>`);
  svg.push(`<circle cx="${px(rearX)}" cy="${px(axleY)}" r="${px(wheelR * 0.09)}" fill="${ink}"/>`);
  svg.push(`<circle cx="${px(frontX)}" cy="${px(axleY)}" r="${px(wheelR * 0.09)}" fill="${ink}"/>`);
  svg.push(`<path d="M${px(rearX)} ${px(axleY)}L${px(crankX)} ${px(crankY)}L${px(seatX)} ${px(seatY)}M${px(crankX)} ${px(crankY)}L${px(headTubeX)} ${px(headTubeY)}L${px(frontX)} ${px(axleY)}" fill="none" stroke="#565b6e" stroke-width="${px(wheelR * 0.12)}" stroke-linejoin="round"/>`);
  svg.push(`<ellipse cx="${px(seatX)}" cy="${px(seatY - H * 0.004)}" rx="${px(W * 0.026)}" ry="${px(H * 0.011)}" fill="${ink}"/>`);
  svg.push(`<circle cx="${px(crankX)}" cy="${px(crankY)}" r="${px(W * 0.016)}" fill="${ink}"/>`);
  svg.push(`<path d="M${px(crankX)} ${px(crankY)}l${px(-W * 0.018)} ${px(H * 0.03)}M${px(crankX)} ${px(crankY)}l${px(W * 0.018)} ${px(H * 0.028)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.07)}"/>`);
  const barTopX = headTubeX + W * 0.008, barTopY = H * 0.44;
  if (bars === "drop handlebars") {
    svg.push(`<path d="M${px(headTubeX)} ${px(headTubeY)}L${px(barTopX)} ${px(barTopY)}q${px(wheelR * 0.18)} ${px(wheelR * 0.04)} ${px(wheelR * 0.18)} ${px(wheelR * 0.28)}q0 ${px(wheelR * 0.14)} ${px(-wheelR * 0.15)} ${px(wheelR * 0.16)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.08)}" stroke-linecap="round"/>`);
  } else if (bars === "swept handlebars") {
    svg.push(`<path d="M${px(headTubeX)} ${px(headTubeY)}L${px(barTopX)} ${px(barTopY)}q${px(-wheelR * 0.5)} ${px(-wheelR * 0.05)} ${px(-wheelR * 0.68)} ${px(wheelR * 0.18)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.08)}" stroke-linecap="round"/>`);
  } else {
    svg.push(`<path d="M${px(headTubeX)} ${px(headTubeY)}L${px(barTopX)} ${px(barTopY)}M${px(barTopX - W * 0.022)} ${px(barTopY - H * 0.01)}L${px(barTopX + W * 0.024)} ${px(barTopY + H * 0.012)}" fill="none" stroke="${ink}" stroke-width="${px(wheelR * 0.08)}" stroke-linecap="round"/>`);
  }
  if (flags["second saddle"]) svg.push(`<rect x="${px(seatX - W * 0.09)}" y="${px(seatY - H * 0.011)}" width="${px(W * 0.035)}" height="${px(H * 0.014)}" fill="${ink}"/>`);
  if (flags["cargo box"]) svg.push(`<rect x="${px(frontX - W * 0.045)}" y="${px(axleY - wheelR - H * 0.095)}" width="${px(W * 0.09)}" height="${px(H * 0.10)}" fill="#b08968" stroke="#6b4f35" stroke-width="4"/>`);
  if (flags["rear rack"]) svg.push(`<rect x="${px(rearX - W * 0.045)}" y="${px(axleY - wheelR - H * 0.03)}" width="${px(W * 0.09)}" height="${px(H * 0.015)}" fill="${ink}"/><path d="M${px(rearX - W * 0.03)} ${px(axleY - wheelR - H * 0.015)}L${px(rearX - W * 0.01)} ${px(axleY - wheelR * 0.3)}M${px(rearX + W * 0.03)} ${px(axleY - wheelR - H * 0.015)}L${px(rearX + W * 0.01)} ${px(axleY - wheelR * 0.3)}" stroke="${ink}" stroke-width="4"/>`);
  if (flags["battery pack"]) svg.push(`<rect x="${px(W * 0.40)}" y="${px(crankY - H * 0.10)}" width="${px(wheelR * 1.05)}" height="${px(H * 0.032)}" fill="#495057"/>`);

  svg.push(`<ellipse cx="${px(bodyX)}" cy="${px(bodyY)}" rx="${px(bodyRx)}" ry="${px(bodyRy)}" fill="${plumage}" stroke="#44464e" stroke-width="4"/>`);
  if (upright) svg.push(`<ellipse cx="${px(bodyX)}" cy="${px(bodyY + bodyRy * 0.15)}" rx="${px(bodyRx * 0.6)}" ry="${px(bodyRy * 0.55)}" fill="${wingC}"/>`);
  else svg.push(`<ellipse cx="${px(bodyX - bodyRx * 0.1)}" cy="${px(bodyY + bodyRy * 0.2)}" rx="${px(bodyRx * 0.55)}" ry="${px(bodyRy * 0.5)}" fill="${wingC}"/>`);
  if (flags["tail feathers"]) svg.push(`<path d="M${px(bodyX - bodyRx + W * 0.008)} ${px(bodyY + bodyRy * 0.4)}q${px(-W * 0.05)} ${px(H * 0.01)} ${px(-W * 0.085)} ${px(H * 0.055)}q${px(W * 0.045)} ${px(-H * 0.005)} ${px(W * 0.085)} ${px(-H * 0.03)}Z" fill="${wingC}" stroke="#44464e" stroke-width="3"/>`);
  if (longNeck) svg.push(`<path d="M${px(bodyX + bodyRx * 0.35)} ${px(bodyY - bodyRy * 0.8)}Q${px(headX - headR * 0.9)} ${px((bodyY + headY) / 2)} ${px(headX - headR * 0.35)} ${px(headY + headR * 0.85)}" fill="none" stroke="${plumage}" stroke-width="${px(headR * 0.75)}" stroke-linecap="round"/>`);
  svg.push(`<circle cx="${px(headX)}" cy="${px(headY)}" r="${px(headR)}" fill="${plumage}" stroke="#44464e" stroke-width="4"/>`);
  svg.push(`<circle cx="${px(headX + headR * 0.3)}" cy="${px(headY - headR * 0.3)}" r="${px(headR * 0.18)}" fill="${ink}"/>`);

  // Beak lengths and depths are multiples of the head width D, exactly as the
  // prompts state them. Every beak shape starts inside the head it hangs from.
  const D = headR * 2, tipX = headX + headR * 0.85, tipY = headY;
  const tri = (len, top, bottom) => `<path d="M${px(tipX)} ${px(tipY - D * top)}L${px(tipX + D * len)} ${px(tipY + D * (top + bottom) * 0.5)}L${px(tipX)} ${px(tipY + D * bottom)}Z" fill="${warmBeak}"/>`;
  const beakShapes = {
    "pouch beak": `${tri(0.85, 0.08, 0.16)}<ellipse cx="${px(tipX + D * 0.42)}" cy="${px(tipY + D * 0.42)}" rx="${px(D * 0.45)}" ry="${px(D * 0.24)}" fill="#f6bd60"/>`,
    "large beak": tri(1.35, 0.2, 0.25),
    "long pointed beak": tri(1.75, 0.05, 0.09),
    "pointed beak": tri(1.0, 0.12, 0.18),
    "flat beak": tri(0.85, 0.04, 0.07),
    "thin curved beak": `<path d="M${px(tipX)} ${px(tipY)}q${px(D * 0.6)} ${px(D * 0.05)} ${px(D * 1.0)} ${px(D * 0.4)}q${px(-D * 0.2)} ${px(-D * 0.35)} ${px(-D)} ${px(-D * 0.45)}Z" fill="${warmBeak}"/>`,
    "hooked beak": `<path d="M${px(tipX)} ${px(tipY - D * 0.1)}q${px(D * 0.35)} ${px(0)} ${px(D * 0.4)} ${px(D * 0.3)}q${px(-D * 0.3)} ${px(-D * 0.05)} ${px(-D * 0.4)} ${px(-D * 0.3)}Z" fill="${warmBeak}"/>`,
    "tall colourful beak": tri(0.9, 0.32, 0.33),
    "short beak": tri(0.4, 0.05, 0.1),
  };
  svg.push(beakShapes[beak]);

  const legTopY = bodyY + bodyRy * 0.7;
  const legEndY = flags["long legs"] ? axleY + wheelR * 0.25 : crankY + H * 0.01;
  const legW = flags["long legs"] ? headR * 0.22 : headR * 0.4;
  svg.push(`<path d="M${px(bodyX - bodyRx * 0.35)} ${px(legTopY)}L${px(crankX - W * 0.015)} ${px(legEndY)}M${px(bodyX + bodyRx * 0.25)} ${px(legTopY)}L${px(crankX + W * 0.012)} ${px(legEndY)}" fill="none" stroke="${legC}" stroke-width="${px(legW)}" stroke-linecap="round"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">\n${svg.join("\n")}\n</svg>`;
}
