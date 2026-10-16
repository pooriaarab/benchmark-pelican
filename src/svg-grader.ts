import type { JsonValue, Task, TaskScore } from "benchmark-core";

const LIMIT = 50 * 1024;
const SHAPES = new Set(["circle", "ellipse", "line", "path", "polygon", "polyline", "rect"]);
const SAFE_ELEMENTS = new Set(["svg", "g", "defs", "path", "circle", "ellipse", "line", "polygon", "polyline", "rect", "lineargradient", "radialgradient", "stop", "clippath", "title", "desc", "text", "tspan"]);
const TEXT_ELEMENTS = new Set(["title", "desc", "text", "tspan"]);
const SAFE_ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[\da-f]{1,5});$/i;
interface Element { name: string; attrs: Record<string, string>; numbers: number[]; curved: boolean; }
interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }
interface Round { element: Element; bounds: Bounds; cx: number; cy: number; rx: number; ry: number; }
interface Scene {
  canvas: Bounds; width: number; height: number; geometry: { element: Element; bounds: Bounds }[];
  rounds: Round[]; stroked: { element: Element; bounds: Bounds }[];
  wheels: [Round, Round] | undefined; frameTop: number;
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) result[match[1]!.toLowerCase()] = (match[2] ?? match[3] ?? "").replace(/&(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[\da-f]{1,5});/gi, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'" })[entity.toLowerCase()] ?? " ");
  return result;
}
function number(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function bounds(element: Element): Bounds | undefined {
  const { attrs, numbers, name } = element;
  if (name === "circle") {
    const cx = number(attrs.cx), cy = number(attrs.cy), r = number(attrs.r);
    return cx === undefined || cy === undefined || r === undefined ? undefined : { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }
  if (name === "ellipse") {
    const cx = number(attrs.cx), cy = number(attrs.cy), rx = number(attrs.rx), ry = number(attrs.ry);
    return cx === undefined || cy === undefined || rx === undefined || ry === undefined ? undefined : { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
  }
  if (name === "line") {
    const values = [attrs.x1, attrs.y1, attrs.x2, attrs.y2].map(number);
    if (values.some((value) => value === undefined)) return undefined;
    const [x1, y1, x2, y2] = values as number[];
    return { minX: Math.min(x1!, x2!), minY: Math.min(y1!, y2!), maxX: Math.max(x1!, x2!), maxY: Math.max(y1!, y2!) };
  }
  if (name === "rect") {
    const x = number(attrs.x) ?? 0, y = number(attrs.y) ?? 0, width = number(attrs.width), height = number(attrs.height);
    return width === undefined || height === undefined ? undefined : { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  if (name === "path" && attrs.d) return pathBounds(attrs.d);
  if (numbers.length < 4) return undefined;
  const xs = numbers.filter((_value, index) => index % 2 === 0);
  const ys = numbers.filter((_value, index) => index % 2 === 1);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// Expands relative and shorthand path commands into absolute coordinate pairs.
// Curve control points are included so bounds approximate the drawn shape.
function pathBounds(d: string): Bounds | undefined {
  const tokens = [...d.matchAll(/([a-zA-Z])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g)].map((match) => match[1] ?? Number(match[2]));
  const xs: number[] = [], ys: number[] = [];
  let command = "", x = 0, y = 0, startX = 0, startY = 0, index = 0;
  const read = () => { const value = tokens[index++]; return typeof value === "number" ? value : undefined; };
  while (index < tokens.length) {
    const token = tokens[index];
    if (typeof token === "string") { command = token; index++; continue; }
    const relative = command === command.toLowerCase();
    const name = command.toUpperCase();
    const pairs = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 }[name];
    if (pairs === undefined) return undefined;
    if (name === "Z") { x = startX; y = startY; xs.push(x); ys.push(y); continue; }
    const values: number[] = [];
    while (index < tokens.length && typeof tokens[index] === "number") {
      const value = read()!;
      values.push(value);
      if (values.length === pairs) break;
    }
    if (values.length < pairs) return undefined;
    const point = (px: number, py: number): [number, number] => {
      const ax = relative ? x + px : px, ay = relative ? y + py : py;
      xs.push(ax); ys.push(ay);
      return [ax, ay];
    };
    if (name === "M" || name === "L" || name === "T") [x, y] = point(values[0]!, values[1]!);
    else if (name === "H") [x] = point(values[0]!, y);
    else if (name === "V") [, y] = point(x, values[0]!);
    else if (name === "C") { point(values[0]!, values[1]!); point(values[2]!, values[3]!); [x, y] = point(values[4]!, values[5]!); }
    else if (name === "S" || name === "Q") { point(values[0]!, values[1]!); [x, y] = point(values[2]!, values[3]!); }
    else if (name === "A") [x, y] = point(values[5]!, values[6]!);
    if (name === "M") { startX = x; startY = y; command = relative ? "l" : "L"; }
  }
  if (xs.length < 2) return undefined;
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// Accepts prose, one surrounding code fence, an XML prolog, and comments around a
// single SVG document, then returns just the markup between <svg> and </svg>.
function extract(answer: string): string | undefined {
  let text = answer.trim();
  const fenced = [...text.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map((match) => match[1]!).filter((block) => block.includes("<svg"));
  if (fenced.length > 0) text = fenced[fenced.length - 1]!.trim();
  const start = text.indexOf("<svg");
  const end = text.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end < start) return undefined;
  return text.slice(start, end + "</svg>".length)
    .replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<![^>]*>/g, "");
}

function scan(answer: string): { scene: Scene } | string {
  if (Buffer.byteLength(answer, "utf8") > LIMIT) return "answer exceeds 50 KiB";
  const svg = extract(answer);
  if (!svg) return "answer does not contain one complete <svg>...</svg> block";
  for (const entity of svg.matchAll(/&[^\s;<>]{1,12};/g)) if (!SAFE_ENTITY.test(entity[0])) return `entity ${entity[0]} is not allowed`;
  if (/<\s*(?:script|foreignObject|image)\b/i.test(svg)) return "active or external content is not allowed";
  if (/\son[a-z]+\s*=|\burl\s*\(\s*['"]?(?!#)|\b(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) return "event handlers and external references are not allowed";

  const tags = [...svg.matchAll(/<\s*(\/)?\s*([a-z][\w:-]*)\b([^<>]*?)(\/)?\s*>/gi)];
  if (tags.length === 0) return "no SVG markup found";
  const stack: string[] = [];
  const elements: Element[] = [];
  let cursor = 0;
  for (const tag of tags) {
    const textNode = svg.slice(cursor, tag.index);
    if (textNode.trim() && !TEXT_ELEMENTS.has(stack[stack.length - 1] ?? "")) return "text is only allowed inside title, desc, text, or tspan elements";
    cursor = tag.index! + tag[0].length;
    const name = tag[2]!.toLowerCase();
    if (tag[1]) {
      if (stack.pop() !== name) return "SVG tags are unbalanced";
      continue;
    }
    if (!SAFE_ELEMENTS.has(name)) return `element <${name}> is not allowed`;
    const attributeSource = tag[3] ?? "";
    const hrefs = [...attributeSource.matchAll(/\b(?:xlink:)?href\s*=\s*([^\s>]+)/gi)];
    if (hrefs.some((match) => !/^(?:"#[^"]*"|'#[^']*')$/.test(match[1]!))) return "only quoted local fragment href values are allowed";
    const attrs = attributes(attributeSource);
    if (Object.keys(attrs).some((key) => key.startsWith("on"))) return "event handlers are not allowed";
    const numericSource = attrs.d ?? attrs.points ?? "";
    const numbers = [...numericSource.matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)].map((match) => Number(match[0]));
    elements.push({ name, attrs, numbers, curved: /[qcsat]/i.test(attrs.d ?? "") });
    if (!tag[4]) stack.push(name);
  }
  if (svg.slice(cursor).trim()) return "trailing text after the SVG root";
  if (stack.length !== 0 || elements[0]?.name !== "svg" || elements.filter((element) => element.name === "svg").length !== 1) return "SVG must have one balanced root";
  const root = elements[0];
  const viewBox = root?.attrs.viewbox?.trim().split(/[ ,]+/).map(Number);
  let canvas: Bounds | undefined;
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0) canvas = { minX: viewBox[0]!, minY: viewBox[1]!, maxX: viewBox[0]! + viewBox[2]!, maxY: viewBox[1]! + viewBox[3]! };
  else {
    const width = number(root?.attrs.width), height = number(root?.attrs.height);
    if (width && height && width > 0 && height > 0) canvas = { minX: 0, minY: 0, maxX: width, maxY: height };
  }
  if (!canvas) return "SVG root needs positive dimensions or viewBox";

  const width = canvas.maxX - canvas.minX, height = canvas.maxY - canvas.minY;
  const geometry = elements.filter((element) => SHAPES.has(element.name)).map((element) => ({ element, bounds: bounds(element) })).filter((item): item is { element: Element; bounds: Bounds } => item.bounds !== undefined);
  const rounds = geometry.filter(({ element }) => element.name === "circle" || element.name === "ellipse").map((item) => ({ ...item, cx: (item.bounds.minX + item.bounds.maxX) / 2, cy: (item.bounds.minY + item.bounds.maxY) / 2, rx: (item.bounds.maxX - item.bounds.minX) / 2, ry: (item.bounds.maxY - item.bounds.minY) / 2 }));
  const stroked = geometry.filter(({ element }) => element.attrs.stroke && element.attrs.stroke !== "none");
  const wheelCandidates = rounds.filter((round) => round.cy > canvas.minY + height * 0.55 && round.rx > width * 0.035 && round.ry > height * 0.05);
  let wheels: [Round, Round] | undefined;
  for (const left of wheelCandidates) for (const right of wheelCandidates) {
    const ratio = Math.max(left.rx, right.rx) / Math.min(left.rx, right.rx);
    if (right.cx - left.cx > width * 0.3 && ratio <= 1.35 && (!wheels || right.cx - left.cx > wheels[1].cx - wheels[0].cx)) wheels = [left, right];
  }
  return { scene: { canvas, width, height, geometry, rounds, stroked, wheels, frameTop: wheels ? wheels[0].cy - height * 0.08 : canvas.minY + height * 0.7 } };
}

// Orange through yellow hues; cream and near-white fills do not count as a beak.
function warmChannel(r: number, g: number, b: number): boolean {
  return (r >= 200 && g >= 90 && g <= 215 && b <= 140 && r - g >= 30 && g - b >= 30)
    || (r >= 210 && g >= 195 && b <= 140 && r - b >= 100 && g - b >= 90);
}
function warm(fill: string | undefined): boolean {
  if (!fill) return false;
  const value = fill.toLowerCase().replaceAll(" ", "");
  if (/^(orange|darkorange|yellow|gold|goldenrod|amber|khaki|chocolate|peru|sandybrown|coral|tomato|orangered)$/.test(value)) return true;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((d) => Number.parseInt(d + d, 16)) : [0, 2, 4].map((i) => Number.parseInt(hex[1]!.slice(i, i + 2), 16));
    const [r, g, b] = digits as [number, number, number];
    return warmChannel(r, g, b);
  }
  const rgb = value.match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})/);
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return warmChannel(r, g, b);
  }
  const hsl = value.match(/^hsla?\((\d{1,3}),(\d{1,3})%,(\d{1,3})%/);
  if (hsl) { const h = Number(hsl[1]), s = Number(hsl[2]), l = Number(hsl[3]); return h >= 18 && h <= 62 && s >= 40 && l >= 35 && l <= 80; }
  return false;
}

const overlap = (a: Bounds, b: Bounds, pad = 0) => a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minY <= b.maxY + pad && a.maxY >= b.minY - pad;
const span = (b: Bounds) => ({ w: b.maxX - b.minX, h: b.maxY - b.minY });

function sceneChecks(scene: Scene) {
  const { canvas, width, height, geometry, rounds, stroked, wheels } = scene;
  const between = (item: { bounds: Bounds }) => wheels && item.bounds.minX <= wheels[1].cx && item.bounds.maxX >= wheels[0].cx;
  const upper = (item: { bounds: Bounds }) => item.bounds.minY < canvas.minY + height * 0.55;
  const bodies = rounds.filter((round) => round.cy < canvas.minY + height * 0.58 && round.rx > width * 0.05 && round.ry > height * 0.06 && (!wheels || round.cy < wheels[0].cy - height * 0.12));
  const body = bodies[0];
  const head = body && rounds.find((round) => round !== body && round.rx >= width * 0.015 && round.rx <= Math.max(body.rx * 0.75, width * 0.02) && round.ry <= Math.max(body.ry * 0.9, height * 0.03) && round.cy < body.cy && round.cx > body.cx - body.rx * 0.35 && round.cx < canvas.maxX);
  const warms = geometry.filter((item) => warm(item.element.attrs.fill) && upper(item) && span(item.bounds).w > width * 0.02);
  const headZone = head ? { minX: head.cx - head.rx * 0.4, minY: head.bounds.minY - head.rx, maxX: head.bounds.maxX + head.rx * 4, maxY: head.bounds.maxY + head.rx * 1.6 } : undefined;
  const beaks = headZone ? warms.filter((item) => overlap(item.bounds, headZone)) : warms;
  const pedalZone = wheels ? { minX: wheels[0].cx, minY: wheels[0].cy - height * 0.3, maxX: wheels[1].cx, maxY: wheels[0].cy } : undefined;
  const legReaches = (item: { bounds: Bounds }, zone: Bounds) => item.bounds.minY > canvas.minY + height * 0.3 && item.bounds.minY < canvas.minY + height * 0.72 && item.bounds.maxY >= zone.minY + height * 0.12 && item.bounds.maxY <= zone.maxY + height * 0.08 && item.bounds.maxX > zone.minX - width * 0.1 && item.bounds.minX < zone.maxX + width * 0.1;
  const legsToPedals = Boolean(pedalZone && (stroked.filter((item) => legReaches(item, pedalZone) && (span(item.bounds).h > height * 0.12 || span(item.bounds).w > width * 0.06)).length >= 2 || stroked.some((item) => legReaches(item, pedalZone) && span(item.bounds).h > height * 0.14)));

  const barZone = (item: { bounds: Bounds }) => Boolean(wheels && item.bounds.minY < wheels[0].cy - height * 0.15 && item.bounds.maxY < wheels[0].cy + height * 0.02 && item.bounds.maxX > wheels[1].cx - (wheels[1].cx - wheels[0].cx) * 0.45 && span(item.bounds).w > width * 0.03);
  const beakHasCurve = beaks.some((item) => item.element.curved);
  const pouch = beaks.some((item, i) => beaks.some((other, j) => i !== j && overlap(item.bounds, other.bounds, width * 0.02) && other.bounds.minY > item.bounds.minY + 4));
  const beakSpan = (predicate: (w: number, h: number) => boolean) => beaks.some((item) => { const s = span(item.bounds); return predicate(s.w, s.h); });
  const legStrokes = stroked.filter((item) => item.bounds.minY > canvas.minY + height * 0.35 && item.bounds.maxY > item.bounds.minY + height * 0.14 && item.bounds.minY < (body ? body.bounds.maxY + height * 0.06 : canvas.minY + height * 0.7));

  const checks: Record<string, boolean> = {
    "svg root": true,
    "two wheels": Boolean(wheels),
    "bicycle frame": Boolean(wheels && stroked.some((item) => between(item) && span(item.bounds).w > (wheels![1].cx - wheels![0].cx) * 0.4 && item.bounds.minY < scene.frameTop)),
    "handlebars": Boolean(wheels && stroked.some((item) => barZone(item) && item.bounds.minX > wheels![0].cx)),
    "drop handlebars": Boolean(wheels && stroked.some((item) => barZone(item) && item.element.curved)),
    "swept handlebars": Boolean(wheels && stroked.some((item) => barZone(item) && span(item.bounds).w > width * 0.07)),
    "pedals": Boolean(wheels && rounds.some((round) => round.rx < wheels![0].rx * 0.4 && round.rx > width * 0.008 && round.cx > wheels![0].cx && round.cx < wheels![1].cx && round.cy < wheels![0].cy && round.cy > wheels![0].cy - height * 0.25)),
    "long wheelbase": Boolean(wheels && wheels[1].cx - wheels[0].cx > width * 0.55),
    "second saddle": Boolean(wheels && rounds.filter((round) => round.rx > width * 0.012 && round.rx < width * 0.05 && round.ry < round.rx * 0.6 && round.cx > wheels![0].cx && round.cx < wheels![1].cx && round.cy > wheels![0].cy - height * 0.3 && round.cy < wheels![0].cy - height * 0.12).length >= 2),
    "cargo box": Boolean(wheels && geometry.some((item) => (item.element.name === "rect" || item.element.name === "polygon") && item.element.attrs.fill && item.element.attrs.fill !== "none" && span(item.bounds).w > width * 0.08 && span(item.bounds).h > height * 0.08 && item.bounds.minY < wheels![0].cy - height * 0.05 && item.bounds.minY > wheels![0].cy - height * 0.55 && overlap(item.bounds, { minX: wheels![0].cx - width * 0.08, minY: canvas.minY, maxX: wheels![1].cx + width * 0.12, maxY: canvas.maxY }))),
    "rear rack": Boolean(wheels && geometry.some((item) => item.element.name === "rect" && span(item.bounds).w > width * 0.07 && span(item.bounds).h < height * 0.06 && item.bounds.maxX < wheels![0].cx + wheels![0].rx + width * 0.06 && item.bounds.minY > wheels![0].bounds.minY - height * 0.12 && item.bounds.maxY < wheels![0].cy)),
    "battery pack": Boolean(wheels && geometry.some((item) => item.element.name === "rect" && item.element.attrs.fill !== "none" && item.element.attrs.fill !== undefined && span(item.bounds).w > width * 0.06 && span(item.bounds).h > height * 0.03 && item.bounds.minX > wheels![0].cx && item.bounds.maxX < wheels![1].cx && item.bounds.maxY < wheels![0].cy && item.bounds.minY > scene.frameTop - height * 0.1)),
    "knobby tires": Boolean(wheels && (wheelThickness(wheels![0]) || wheelThickness(wheels![1]))),
    "small wheels": Boolean(wheels && wheels[0].rx < width * 0.09 && wheels[1].rx < width * 0.09),
    "bird body": bodies.length > 0,
    "upright body": bodies.some((round) => round.ry >= round.rx * 0.9),
    "bird head": Boolean(head),
    "long neck": Boolean(body && head && stroked.some((item) => span(item.bounds).h > height * 0.1 && span(item.bounds).w < width * 0.35 && item.bounds.minY <= head.bounds.maxY + height * 0.05 && item.bounds.maxY >= body.bounds.minY - height * 0.05 && item.bounds.minY < body.bounds.minY)),
    "legs reaching the pedals": legsToPedals,
    "long legs": legStrokes.some((item) => Number(item.element.attrs["stroke-width"] ?? 99) <= 9 && span(item.bounds).h > height * 0.16) || legStrokes.some((item) => span(item.bounds).h > height * 0.24),
    "tail feathers": Boolean(body && geometry.some((item) => item.element.attrs.fill && item.element.attrs.fill !== "none" && item.bounds.maxX < body.bounds.minX + width * 0.06 && span(item.bounds).w > width * 0.04 && item.bounds.minY > body.bounds.minY)),
    // Beak styles. Each predicate reads bounds of warm filled geometry near the head.
    "pouch beak": pouch && beakSpan((w) => w > width * 0.1),
    "curved beak": beakHasCurve && beakSpan((w, h) => w < width * 0.1 && h > w * 0.5),
    "large beak": !pouch && beakSpan((w) => w > width * 0.16),
    "long pointed beak": beakSpan((w, h) => w > width * 0.14 && w / Math.max(h, 1) >= 3),
    "flat beak": beakSpan((w, h) => w > width * 0.05 && w < width * 0.13 && w / Math.max(h, 1) >= 2.5),
    "orange beak": beakSpan((w) => w > width * 0.04 && w < width * 0.12),
    "hooked beak": beakHasCurve && beakSpan((w) => w < width * 0.1),
    "short beak": beakSpan((w, h) => w < width * 0.08 && w / Math.max(h, 1) >= 1.4),
    "small hooked beak": beakHasCurve && beakSpan((w) => w < width * 0.08),
    "thin curved beak": beakHasCurve && beakSpan((w, h) => w > width * 0.1 && h > height * 0.07),
    "tall colourful beak": beakSpan((w, h) => h > w && h > height * 0.06),
    "pointed beak": beakSpan((w, h) => w > width * 0.08 && w < width * 0.16 && w / Math.max(h, 1) >= 3),
    "beak": beaks.length > 0,
  };
  function wheelThickness(wheel: Round) {
    const strokeWidth = Number(wheel.element.attrs["stroke-width"] ?? 0);
    return strokeWidth >= wheel.rx * 0.14 || rounds.some((round) => Math.abs(round.cx - wheel.cx) < wheel.rx * 0.15 && Math.abs(round.cy - wheel.cy) < wheel.rx * 0.15 && round.rx > wheel.rx && round.rx < wheel.rx * 1.3);
  }
  return { checks, bodies, head, beaks };
}

const WEIGHTS: Record<string, number> = {
  "svg root": 0.04, "two wheels": 0.15, "bicycle frame": 0.11, "handlebars": 0.06, "drop handlebars": 0.06, "swept handlebars": 0.06,
  "pedals": 0.05, "long wheelbase": 0.04, "second saddle": 0.04, "cargo box": 0.05, "rear rack": 0.04, "battery pack": 0.04,
  "knobby tires": 0.05, "small wheels": 0.05, "bird body": 0.12, "upright body": 0.12, "bird head": 0.07, "long neck": 0.05,
  "legs reaching the pedals": 0.05, "long legs": 0.04, "tail feathers": 0.04,
  "pouch beak": 0.1, "curved beak": 0.1, "large beak": 0.1, "long pointed beak": 0.1, "flat beak": 0.1, "orange beak": 0.1,
  "hooked beak": 0.1, "short beak": 0.1, "small hooked beak": 0.1, "thin curved beak": 0.1, "tall colourful beak": 0.1, "pointed beak": 0.1, "beak": 0.1,
};
const BASE_CHECKS: Array<[string, number]> = [["svg canvas", 0.05], ["complexity", 0.08], ["coverage", 0.02]];
const DEFAULT_PARTS = ["svg root", "two wheels", "bicycle frame", "handlebars", "pedals", "bird body", "bird head", "beak", "legs reaching the pedals"];

export function gradeSvg(answer: unknown, task?: Task): TaskScore {
  if (typeof answer !== "string" || answer.trim() === "") return { score: 0, reason: "No SVG answer was provided." };
  const scanned = scan(answer);
  if (typeof scanned === "string") return { score: 0, reason: `Invalid SVG: ${scanned}.` };
  const { scene } = scanned;
  const { width, height, geometry } = scene;
  const { checks, head, beaks } = sceneChecks(scene);
  const parts = (task?.metadata?.requiredParts as string[] | undefined)?.filter((part) => WEIGHTS[part] !== undefined) ?? DEFAULT_PARTS;
  const rows: Array<{ name: string; weight: number; passed: boolean }> = [];
  for (const part of parts) rows.push({ name: part, weight: WEIGHTS[part]!, passed: checks[part] === true });
  const useful = geometry.filter((item) => !(item.element.name === "rect" && span(item.bounds).w > width * 0.9 && span(item.bounds).h > height * 0.9));
  const extent = useful.length ? useful.reduce((all, item) => ({ minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) }), useful[0]!.bounds) : undefined;
  for (const [name, weight] of BASE_CHECKS) {
    const passed = name === "svg canvas" ? true : name === "complexity" ? geometry.length >= 12 && geometry.length <= 200 : Boolean(extent && extent.maxX - extent.minX > width * 0.5 && extent.maxY - extent.minY > height * 0.5);
    rows.push({ name, weight, passed });
  }
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let score = rows.reduce((sum, row) => sum + (row.passed ? row.weight : 0), 0) / total;
  const caps: string[] = [];
  const bicycleEvidence = Boolean(scene.wheels) || checks["bicycle frame"] === true;
  const birdEvidence = Boolean(head && beaks.length > 0) || beaks.length > 0 && checks["bird body"] === true;
  if (!bicycleEvidence) { score = Math.min(score, 0.2); caps.push("no bicycle geometry"); }
  if (!birdEvidence) { score = Math.min(score, 0.2); caps.push("no bird with a beak"); }
  const rounded = Math.round(score * 100) / 100;
  const passed = rows.filter((row) => row.passed).map((row) => row.name);
  const missed = rows.filter((row) => !row.passed).map((row) => row.name);
  const reason = `Passed: ${passed.join(", ")}. Missed: ${missed.join(", ") || "none"}.${caps.length ? ` Capped: ${caps.join("; ")}.` : ""}`;
  return { score: rounded, reason, details: { checks: rows.map((row) => ({ ...row, weight: Math.round(row.weight / total * 1000) / 1000 })), caps } as JsonValue };
}
