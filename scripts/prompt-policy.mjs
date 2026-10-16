// Prompt-only policy: a drawing built purely from what the prompt text states.
// It parses the part phrases out of the task prompt and lays out simple shapes
// with natural proportions — the way a model that follows the prompt would.
// The E2E runs it on every task to prove the benchmark is solvable from the
// prompt alone: it never reads task.expected or task.metadata.
//
// The layout follows the same proportions the prompt describes (wheels low in
// the frame, bird seated over the frame, beak sized against the head), drawn
// in a 640 x 420 space and then fitted into whatever canvas is requested.

const BEAKS = ["pouch beak", "long pointed beak", "thin curved beak", "tall colourful beak", "large beak", "pointed beak", "flat beak", "hooked beak", "short beak"];
const PAIRS = [
  ["long neck", "short neck"],
  ["upright body", "level body"],
  ["drop handlebars", "swept handlebars"],
  ["small wheels", "full-size wheels"],
  ["long wheelbase", "standard wheelbase"],
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

const DW = 640;
const DH = 420;

export function promptOnlySvg(prompt, canvasW = DW, canvasH = DH) {
  const scale = Math.min(canvasW / DW, canvasH / DH) * 0.96;
  const ox = Math.round((canvasW - DW * scale) / 2);
  const oy = Math.round((canvasH - DH * scale) / 2);

  const beak = named(prompt, BEAKS) ?? "pointed beak";
  const neck = named(prompt, PAIRS[0]) ?? "short neck";
  const posture = named(prompt, PAIRS[1]) ?? "level body";
  const bars = named(prompt, PAIRS[2]) ?? "handlebars";
  const wheelSize = named(prompt, PAIRS[3]) ?? "full-size wheels";
  const wheelbaseKind = named(prompt, PAIRS[4]) ?? "standard wheelbase";
  const tires = named(prompt, PAIRS[5]) ?? "smooth tires";
  const flags = Object.fromEntries(FLAGS.map((flag) => [flag, prompt.toLowerCase().includes(flag)]));

  const cy = 318;
  const wheelbase = wheelbaseKind === "long wheelbase" ? 430 : 340;
  const radius = wheelSize === "small wheels" ? 44 : 66;
  const tyre = tires === "fat tires" ? Math.round(radius * 0.4) : 12;
  const rearX = Math.round(320 - wheelbase / 2);
  const frontX = Math.round(320 + wheelbase / 2);
  const bbX = Math.round(rearX + wheelbase * 0.42);
  const bbY = cy - 22;
  const seatX = Math.round(rearX + wheelbase * 0.36);
  const seatY = cy - 78;
  const headX = Math.round(frontX - wheelbase * 0.12);
  const headY = cy - 96;
  const dark = "#22252b";

  const parts = [
    `<path d="M0 368H${DW}" fill="none" stroke="#6b705c" stroke-width="8"/>`,
    `<circle cx="${rearX}" cy="${cy}" r="${radius}" fill="none" stroke="${dark}" stroke-width="${tyre}"${tires === "knobby tires" ? ' stroke-dasharray="9 11"' : ""}/>`,
    `<circle cx="${frontX}" cy="${cy}" r="${radius}" fill="none" stroke="${dark}" stroke-width="${tyre}"${tires === "knobby tires" ? ' stroke-dasharray="9 11"' : ""}/>`,
    `<circle cx="${rearX}" cy="${cy}" r="7" fill="${dark}"/><circle cx="${frontX}" cy="${cy}" r="7" fill="${dark}"/>`,
    `<path d="M${rearX} ${cy}L${bbX} ${bbY}L${seatX} ${seatY}L${bbX} ${bbY}L${headX} ${headY}L${frontX} ${cy}M${seatX} ${seatY}L${seatX - 6} ${seatY - 14}" fill="none" stroke="#3d405b" stroke-width="12" stroke-linejoin="round"/>`,
    `<ellipse cx="${seatX - 6}" cy="${seatY - 20}" rx="19" ry="7" fill="${dark}"/>`,
    `<path d="M${bbX} ${bbY}l-18 24m18-24 20 22" fill="none" stroke="${dark}" stroke-width="8"/>`,
    `<circle cx="${bbX}" cy="${bbY}" r="12" fill="#7a6a53"/>`,
  ];
  if (tires === "knobby tires") {
    parts.push(`<circle cx="${rearX}" cy="${cy}" r="${radius + 7}" fill="none" stroke="${dark}" stroke-width="6" stroke-dasharray="7 9"/>`);
    parts.push(`<circle cx="${frontX}" cy="${cy}" r="${radius + 7}" fill="none" stroke="${dark}" stroke-width="6" stroke-dasharray="7 9"/>`);
  }
  const barX = headX, barY = headY - 24;
  if (bars === "drop handlebars") {
    parts.push(`<path d="M${headX} ${headY}L${barX} ${barY}" fill="none" stroke="${dark}" stroke-width="9"/><path d="M${barX} ${barY}q24 4 24 26q0 16 -18 18" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>`);
  } else if (bars === "swept handlebars") {
    parts.push(`<path d="M${headX} ${headY}L${barX} ${barY}M${barX} ${barY}q-40 -6 -52 18M${barX} ${barY}q34 -8 48 12" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>`);
  } else {
    parts.push(`<path d="M${headX} ${headY}L${barX} ${barY}M${barX - 14} ${barY - 10}l30 4m-30 -4 34 18" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>`);
  }
  if (flags["second saddle"]) parts.push(`<ellipse cx="${Math.round(rearX + wheelbase * 0.62)}" cy="${seatY - 18}" rx="19" ry="7" fill="${dark}"/><path d="M${Math.round(rearX + wheelbase * 0.62)} ${seatY - 12}L${Math.round(rearX + wheelbase * 0.62)} ${seatY + 4}" fill="none" stroke="${dark}" stroke-width="8"/>`);
  if (flags["cargo box"]) parts.push(`<rect x="${frontX - 40}" y="${cy - radius - 58}" width="96" height="56" rx="6" fill="#b08968" stroke="#6b4f35" stroke-width="5"/>`);
  if (flags["rear rack"]) parts.push(`<rect x="${rearX - 48}" y="${cy - radius - 14}" width="92" height="10" rx="4" fill="${dark}"/>`);
  if (flags["battery pack"]) parts.push(`<rect x="${Math.round(rearX + wheelbase * 0.28)}" y="${bbY - 66}" width="70" height="24" rx="6" fill="#495057"/>`);

  const upright = posture === "upright body";
  const bodyRx = upright ? 62 : 90;
  const bodyRy = upright ? 88 : 58;
  const bx = 310;
  const bodyCy = upright ? 176 : 152;
  const longNeck = neck === "long neck";
  const hx = Math.round(bx + bodyRx + (longNeck ? 66 : 30));
  const hy = Math.round(bodyCy - bodyRy - (longNeck ? 52 : 26));
  const hr = upright ? 34 : 38;

  parts.push(`<ellipse cx="${bx}" cy="${bodyCy}" rx="${bodyRx}" ry="${bodyRy}" fill="#f4f1de" stroke="#33343a" stroke-width="5"/>`);
  if (!upright) parts.push(`<path d="M${bx - 34} ${bodyCy}q58 -44 104 2q-50 56 -104 -2" fill="#81b29a" stroke="#33343a" stroke-width="4"/>`);
  else parts.push(`<ellipse cx="${bx}" cy="${bodyCy + 8}" rx="${Math.round(bodyRx * 0.62)}" ry="${Math.round(bodyRy * 0.6)}" fill="#fdf8ec"/>`);
  if (flags["tail feathers"]) parts.push(`<path d="M${bx - bodyRx + 8} ${bodyCy + 26}q-46 4 -64 44q48 -4 70 -28" fill="#81b29a" stroke="#33343a" stroke-width="4"/>`);
  if (longNeck) parts.push(`<path d="M${bx + bodyRx - 26} ${bodyCy - bodyRy + 22}q10 -60 ${hx - bx - bodyRx + 40} ${hy - bodyCy + bodyRy - 8}" fill="none" stroke="#f4f1de" stroke-width="30" stroke-linecap="round"/>`);
  parts.push(`<circle cx="${hx}" cy="${hy}" r="${hr}" fill="#f4f1de" stroke="#33343a" stroke-width="5"/>`);
  parts.push(`<circle cx="${hx + 14}" cy="${hy - 10}" r="5" fill="#22252b"/>`);

  // Beak lengths and depths are multiples of the head width, exactly as the
  // prompt states them.
  const tipX = hx + hr;
  const dd = (k) => Math.round(k * hr * 2);
  switch (beak) {
    case "pouch beak":
      parts.push(`<path d="M${tipX - 6} ${hy - 6}L${Math.round(tipX + hr * 2.9)} ${hy + 8}L${tipX - 6} ${hy + 16}Z" fill="#f4a261" stroke="#9c6644" stroke-width="4"/>`);
      parts.push(`<path d="M${tipX} ${hy + 14}q${dd(0.8)} ${dd(0.55)} ${dd(1.5)} ${dd(0.1)}q${dd(-0.7)} ${dd(0.65)} ${dd(-1.5)} ${dd(-0.1)}" fill="#f6bd60" stroke="#9c6644" stroke-width="4"/>`);
      break;
    case "large beak":
      parts.push(`<path d="M${tipX - 8} ${hy - dd(0.18)}Q${Math.round(tipX + dd(1.6))} ${hy - dd(0.2)} ${Math.round(tipX + dd(1.5))} ${hy + dd(0.15)}Q${Math.round(tipX + dd(1.15))} ${hy + dd(0.42)} ${tipX - 8} ${hy + dd(0.22)}Z" fill="#f4a261" stroke="#9c6644" stroke-width="4"/>`);
      break;
    case "long pointed beak":
      parts.push(`<path d="M${tipX - 6} ${hy - 4}L${Math.round(tipX + dd(1.8))} ${hy + 6}L${tipX - 6} ${hy + 12}Z" fill="#f4a261" stroke="#9c6644" stroke-width="3"/>`);
      break;
    case "pointed beak":
      parts.push(`<path d="M${tipX - 6} ${hy - 3}L${Math.round(tipX + dd(1.1))} ${hy + 6}L${tipX - 6} ${hy + 12}Z" fill="#f4a261"/>`);
      break;
    case "flat beak":
      parts.push(`<path d="M${tipX - 6} ${hy}L${Math.round(tipX + dd(0.85))} ${hy + 4}L${tipX - 6} ${hy + dd(0.11)}Z" fill="#f4a261"/>`);
      break;
    case "thin curved beak":
      parts.push(`<path d="M${tipX - 4} ${hy + 2}q${dd(0.95)} ${dd(0.1)} ${dd(1.1)} ${dd(0.5)}q${dd(-0.2)} ${dd(-0.5)} ${dd(-1.1)} ${dd(-0.55)}Z" fill="#f4a261"/>`);
      break;
    case "tall colourful beak":
      parts.push(`<path d="M${tipX - 8} ${hy - dd(0.24)}q${dd(0.6)} ${dd(0.08)} ${dd(0.55)} ${dd(0.68)}q${dd(-0.55)} ${dd(-0.1)} ${dd(-0.55)} ${dd(-0.68)}Z" fill="#f4a261" stroke="#9c6644" stroke-width="3"/>`);
      break;
    case "hooked beak":
      parts.push(`<path d="M${tipX - 4} ${hy - 8}q${dd(0.45)} ${dd(0.03)} ${dd(0.36)} ${dd(0.42)}q${dd(-0.36)} ${dd(-0.1)} ${dd(-0.36)} ${dd(-0.42)}" fill="#f4a261"/>`);
      break;
    default:
      parts.push(`<path d="M${tipX - 4} ${hy}L${Math.round(tipX + dd(0.42))} ${hy + 5}L${tipX - 4} ${hy + dd(0.13)}Z" fill="#f4a261"/>`);
  }

  const legY = flags["long legs"] ? Math.round(bodyCy - bodyRy * 0.25) : bodyCy + bodyRy - 6;
  const legSpread = upright ? 30 : 44;
  const legWidth = flags["long legs"] ? 6 : 13;
  parts.push(`<path d="M${bx - legSpread} ${legY}Q${bx - legSpread - 8} ${Math.round((legY + bbY - 2) / 2)} ${bx - legSpread + 10} ${bbY - 2}M${bx + legSpread - 14} ${legY + 4}Q${bx + legSpread - 4} ${Math.round((legY + bbY - 2) / 2)} ${bx + legSpread + 12} ${bbY - 2}" fill="none" stroke="#e9c46a" stroke-width="${legWidth}" stroke-linecap="round"/>`);
  parts.push(`<path d="M${bx - legSpread + 2} ${bbY + 2}l24 2M${bx + legSpread + 4} ${bbY}l22 -6" fill="none" stroke="#33343a" stroke-width="7" stroke-linecap="round"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasW} ${canvasH}" role="img">\n${transformSvg(parts.join("\n"), scale, ox, oy)}\n</svg>`;
}
