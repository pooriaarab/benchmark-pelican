import type { JsonValue, Task, TaskScore } from "benchmark-core";

const LIMIT = 50 * 1024;
const SHAPES = new Set(["circle", "ellipse", "line", "path", "polygon", "polyline", "rect"]);
const SAFE_ELEMENTS = new Set(["svg", "g", "defs", "path", "circle", "ellipse", "line", "polygon", "polyline", "rect", "lineargradient", "radialgradient", "stop", "clippath", "title", "desc", "text", "tspan", "style"]);
const TEXT_ELEMENTS = new Set(["title", "desc", "text", "tspan", "style"]);
const SAFE_ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[\da-f]{1,5});$/i;
// Presentation properties the grader reads from attributes, <style> class
// rules, or inline style. Only these can reach the geometry checks.
const PAINT_PROPS = new Set(["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity"]);
interface Element { name: string; attrs: Record<string, string>; numbers: number[]; curved: boolean; parent: number | undefined; paint: Record<string, string>; }
interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }
interface Round { element: Element; bounds: Bounds; cx: number; cy: number; rx: number; ry: number; }
interface Scene {
  extent: Bounds; width: number; height: number; geometry: { element: Element; bounds: Bounds }[];
  rounds: Round[]; stroked: { element: Element; bounds: Bounds }[];
  sceneShapes: { element: Element; bounds: Bounds }[];
  wheels: [Round, Round] | undefined;
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

// A <style> block may only hold `.class { prop: value; ... }` rules where every
// property is a paint property. Anything else (at-rules, element or id
// selectors, urls, expressions) is rejected, so stylesheet text can never pull
// in external content or reprogram the document.
function parseStyleRules(text: string): { cls: string; props: Record<string, string> }[] | string {
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: { cls: string; props: Record<string, string> }[] = [];
  let rest = cleaned;
  const rule = /^\s*\.(-?[_a-zA-Z][\w-]*)\s*\{([^}]*)\}/;
  while (rest.trim().length > 0) {
    const match = rest.match(rule);
    if (!match) return "style elements may only contain .class rules of paint properties";
    const props: Record<string, string> = {};
    for (const declaration of match[2]!.split(";")) {
      const entry = declaration.trim();
      if (!entry) continue;
      const colon = entry.indexOf(":");
      if (colon === -1) return "style elements may only contain .class rules of paint properties";
      const prop = entry.slice(0, colon).trim().toLowerCase(), value = entry.slice(colon + 1).trim();
      if (!PAINT_PROPS.has(prop) || !value || /[()@!]/.test(value)) return "style elements may only contain .class rules of paint properties";
      props[prop] = value;
    }
    rules.push({ cls: match[1]!, props });
    rest = rest.slice(match[0].length);
  }
  return rules;
}

// Inline style="..." is read leniently: only whitelisted paint properties are
// seen, and a declaration whose value could call out (url, expression) is
// skipped. The document-level url() and handler checks already ran.
function inlinePaint(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const prop = declaration.slice(0, colon).trim().toLowerCase(), value = declaration.slice(colon + 1).trim();
    if (PAINT_PROPS.has(prop) && value && !/[()@!]/.test(value)) out[prop] = value;
  }
  return out;
}

// Resolves each element's effective paint: inherited value, then presentation
// attribute, then matching class rules in order, then inline style. An
// unspecified fill means the shape paints black, as a renderer would show it.
function resolvePaint(elements: Element[], rules: { cls: string; props: Record<string, string> }[]): void {
  for (let index = 0; index < elements.length; index++) {
    const chain: number[] = [];
    for (let cursor: number | undefined = index; cursor !== undefined; cursor = elements[cursor]!.parent) chain.unshift(cursor);
    const paint: Record<string, string> = {};
    for (const member of chain) {
      const element = elements[member]!;
      for (const prop of PAINT_PROPS) if (element.attrs[prop] !== undefined) paint[prop] = element.attrs[prop]!;
      const classes = element.attrs.class?.split(/\s+/).filter(Boolean) ?? [];
      for (const rule of rules) if (classes.includes(rule.cls)) Object.assign(paint, rule.props);
      if (element.attrs.style) Object.assign(paint, inlinePaint(element.attrs.style));
    }
    if (SHAPES.has(elements[index]!.name) && paint.fill === undefined) paint.fill = "#000";
    elements[index]!.paint = paint;
  }
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
  const stack: number[] = [];
  const elements: Element[] = [];
  const styleTexts: string[] = [];
  let cursor = 0;
  for (const tag of tags) {
    const textNode = svg.slice(cursor, tag.index);
    if (textNode.trim()) {
      const parent = stack.length ? elements[stack[stack.length - 1]!] : undefined;
      if (parent?.name === "style") styleTexts.push(textNode);
      else if (!TEXT_ELEMENTS.has(parent?.name ?? "")) return "text is only allowed inside title, desc, text, tspan, or style elements";
    }
    cursor = tag.index! + tag[0].length;
    const name = tag[2]!.toLowerCase();
    if (tag[1]) {
      if (elements[stack.pop()!]?.name !== name) return "SVG tags are unbalanced";
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
    elements.push({ name, attrs, numbers, curved: /[qcsat]/i.test(attrs.d ?? ""), parent: stack[stack.length - 1], paint: {} });
    if (!tag[4]) stack.push(elements.length - 1);
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

  const rules = parseStyleRules(styleTexts.join("\n"));
  if (typeof rules === "string") return rules;
  resolvePaint(elements, rules);

  const geometry = elements.filter((element) => SHAPES.has(element.name)).map((element) => ({ element, bounds: bounds(element) })).filter((item): item is { element: Element; bounds: Bounds } => item.bounds !== undefined);
  // A background rectangle that covers the canvas is decoration, not part of
  // the drawing, so it never reaches the figure.
  const canvasWidth = canvas.maxX - canvas.minX, canvasHeight = canvas.maxY - canvas.minY;
  const useful = geometry.filter((item) => !(item.element.name === "rect" && item.bounds.maxX - item.bounds.minX > canvasWidth * 0.9 && item.bounds.maxY - item.bounds.minY > canvasHeight * 0.9));
  const usefulExtent = useful.length
    ? useful.reduce((all, item) => ({ minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) }), { ...useful[0]!.bounds })
    : { ...canvas };
  const rounds = geometry.filter(({ element }) => element.name === "circle" || element.name === "ellipse").map((item) => ({ ...item, cx: (item.bounds.minX + item.bounds.maxX) / 2, cy: (item.bounds.minY + item.bounds.maxY) / 2, rx: (item.bounds.maxX - item.bounds.minX) / 2, ry: (item.bounds.maxY - item.bounds.minY) / 2 }));
  const stroked = geometry.filter(({ element }) => element.paint.stroke && element.paint.stroke !== "none");
  // The wheels are the two circles the frame actually connects: a frame line
  // or path must reach within a half radius of both centres. A loose circle —
  // a sun, a ball, a hub dot — is never a wheel, whatever its size. Pairs must
  // be alike in size, roughly level, and clearly separated.
  const frameStrokes = stroked.filter((item) => item.element.name === "path" || item.element.name === "line" || item.element.name === "polyline");
  const pairLike = (left: Round, right: Round) => {
    const big = Math.max(left.rx, right.rx, left.ry, right.ry), small = Math.min(left.rx, right.rx);
    const sep = right.cx - left.cx;
    return sep > 0 && !isRing(left, rounds) && !isRing(right, rounds) && big / small <= 1.5 && sep >= (left.rx + right.rx) * 1.2 && Math.abs(left.cy - right.cy) <= big * 0.6;
  };
  const connected = (left: Round, right: Round) => {
    const pad = Math.max(4, Math.max(left.rx, right.rx) * 0.6);
    const cy = (left.cy + right.cy) / 2;
    return frameStrokes.some((item) => item.bounds.minX <= left.cx + pad && item.bounds.maxX >= right.cx - pad && item.bounds.minY <= cy + pad && item.bounds.maxY >= cy - pad);
  };
  let wheels: [Round, Round] | undefined;
  for (const left of rounds) for (const right of rounds) {
    if (right.cx <= left.cx || !pairLike(left, right) || !connected(left, right)) continue;
    if (!wheels || Math.min(left.rx, right.rx) > Math.min(wheels[0].rx, wheels[1].rx) || (Math.min(left.rx, right.rx) === Math.min(wheels[0].rx, wheels[1].rx) && right.cx - left.cx > wheels[1].cx - wheels[0].cx)) wheels = [left, right];
  }
  if (!wheels) {
    // Fallback for drawings whose frame misses the hubs: the lowest similar
    // round pair is still the best wheel guess, so the reasons stay accurate.
    const low = rounds.filter((round) => round.cy > usefulExtent.minY + (usefulExtent.maxY - usefulExtent.minY) * 0.4);
    for (const left of low) for (const right of low) {
      if (right.cx <= left.cx || !pairLike(left, right)) continue;
      if (!wheels || Math.min(left.rx, right.rx) > Math.min(wheels[0].rx, wheels[1].rx)) wheels = [left, right];
    }
  }
  // The figure is whatever touches the wheels, transitively. Long thin
  // horizontal strokes or bands — a ground line, a horizon, a sky band — are
  // decoration and can never join, so widening the canvas or adding a
  // full-width ground changes nothing. A detached shape — a sun, a cloud —
  // that does not touch the figure can never join either. Only a shape that
  // literally overlaps the figure (within a hairline pad for anti-aliasing
  // gaps) counts as part of the drawing.
  const wheelbase = wheels ? wheels[1].cx - wheels[0].cx : 0;
  const diameter = wheels ? Math.max(wheels[0].rx, wheels[1].rx) * 2 : 0;
  const members = useful.filter((item) => {
    const w = item.bounds.maxX - item.bounds.minX, h = item.bounds.maxY - item.bounds.minY;
    return !(wheels && w > wheelbase * 1.35 && h < w * 0.2);
  });
  let sceneShapes = members;
  if (wheels) {
    const pad = Math.max(2, diameter * 0.03);
    const inScene = new Set<number>();
    const queue: number[] = [];
    members.forEach((item, index) => {
      if (item.element === wheels[0].element || item.element === wheels[1].element) { inScene.add(index); queue.push(index); }
    });
    while (queue.length) {
      const item = members[queue.pop()!]!;
      for (let index = 0; index < members.length; index++) {
        if (inScene.has(index)) continue;
        if (overlap(item.bounds, members[index]!.bounds, pad)) { inScene.add(index); queue.push(index); }
      }
    }
    sceneShapes = members.filter((_item, index) => inScene.has(index));
  }
  const extent = sceneShapes.length
    ? sceneShapes.reduce((all, item) => ({ minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) }), { ...sceneShapes[0]!.bounds })
    : usefulExtent;
  const width = extent.maxX - extent.minX, height = extent.maxY - extent.minY;
  return { scene: { extent, width, height, geometry, rounds, stroked, wheels, sceneShapes } };
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
// A concentric outer ring hugging a circle is a tyre ring, not a wheel or a
// body: the real part is the circle inside it.
const isRing = (round: Round, rounds: Round[]) => rounds.some((other) => other !== round && Math.abs(other.cx - round.cx) < round.rx * 0.15 && Math.abs(other.cy - round.cy) < round.rx * 0.15 && other.rx > round.rx * 0.7 && other.rx < round.rx);

function sceneChecks(scene: Scene) {
  const { extent, width, height, wheels } = scene;
  // Part checks only see the connected figure: decoration that stays outside
  // the scene — a sun, a cloud — cannot fake a part or poison one (a warm
  // disc near the head must not join the beak union).
  const member = new Set(scene.sceneShapes.map((item) => item.element));
  const geometry = scene.geometry.filter((item) => member.has(item.element));
  const rounds = scene.rounds.filter((item) => member.has(item.element));
  const stroked = scene.stroked.filter((item) => member.has(item.element));
  // Every measure is derived from the vehicle's own wheels: R is the larger
  // wheel radius, WB the distance between the axles, axleY the axle line, and
  // rearCx/frontCx the two hubs. No check reads the canvas, the viewBox, or
  // the size of the whole drawing, so decoration and canvas size cannot move
  // a threshold. When no wheels are found the fallbacks still compute, but
  // the evidence caps keep the score low anyway.
  const R = wheels ? Math.max(wheels[0].rx, wheels[1].rx) : Math.max(10, height * 0.15);
  const WB = wheels ? wheels[1].cx - wheels[0].cx : width * 0.5;
  const rearCx = wheels ? wheels[0].cx : extent.minX + width * 0.25;
  const frontCx = wheels ? wheels[1].cx : extent.minX + width * 0.75;
  const axleY = wheels ? (wheels[0].cy + wheels[1].cy) / 2 : extent.minY + height * 0.8;
  const between = (item: { bounds: Bounds }) => item.bounds.minX <= frontCx && item.bounds.maxX >= rearCx;
  const wheelSet = new Set(wheels ? [wheels[0].element, wheels[1].element] : []);
  const bodies = rounds.filter((round) => !wheelSet.has(round.element) && !isRing(round, rounds) && round.cy < axleY - R * 0.8 && round.rx > R * 0.25 && round.ry > R * 0.25);
  // The body is the largest substantial round above the vehicle, so a head
  // circle cannot win.
  const body = bodies.reduce<Round | undefined>((best, round) => !best || round.rx * round.ry > best.rx * best.ry ? round : best, undefined);
  const head = body && rounds.find((round) => round !== body && !wheelSet.has(round.element) && round.rx >= R * 0.08 && round.rx <= Math.max(body.rx * 0.75, R * 0.15) && round.ry <= Math.max(body.ry * 0.9, R * 0.15) && round.cy < body.cy - Math.min(4, R * 0.05) && round.cx > body.cx - body.rx * 0.4 && round.cx < body.cx + body.rx * 3);
  // Warm candidates come from the full geometry: a long beak can reach past
  // the figure's distance rule and still be a beak. But a beak element must
  // overlap the head it hangs from — a warm sun or cloud floating near the
  // head never enters the beak union and cannot reclassify it. The only
  // second hop is a pouch: warm geometry that hangs clearly below an attached
  // beak AND below the head's centre line, so a warm dot inside the beak's own
  // bounding box cannot turn the beak into a pouch.
  // A beak must be a filled warm shape. A stroke-only orange curve is not
  // read as a beak. The shape must still overlap the head it hangs from, or
  // hang below an attached beak as a pouch.
  const warms = scene.geometry.filter((item) => warm(item.element.paint.fill) && item.bounds.minY < axleY - R * 0.3 && span(item.bounds).w > R * 0.1);
  const headPad = head ? { minX: head.bounds.minX - head.rx * 0.2, minY: head.bounds.minY - head.rx * 0.2, maxX: head.bounds.maxX + head.rx * 0.2, maxY: head.bounds.maxY + head.rx * 0.2 } : undefined;
  const attached = head && headPad ? warms.filter((item) => overlap(item.bounds, headPad)) : [];
  // A pouch is a second warm shape that hangs clearly below the head's centre
  // line and starts under the head or the beak's root — a pelican's throat
  // pouch. A warm dot at the beak's far edge or inside the beak's own bounds
  // (a decoration, a sun) can neither be a pouch nor reclassify the beak.
  const hangsLow = (item: { bounds: Bounds }) => Boolean(head && headPad && item.bounds.minY > head.cy && item.bounds.minX <= headPad.maxX);
  const hanging = head ? warms.filter((item) => !attached.includes(item) && hangsLow(item) && attached.some((top) => overlap(item.bounds, top.bounds, R * 0.05))) : [];
  const beaks = [...attached, ...hanging];
  const pouchParts = beaks.filter((item) => hangsLow(item) && beaks.some((top) => top !== item && item.bounds.maxY > top.bounds.maxY + (head ? head.rx * 0.1 : 0)));
  // A leg must start above the wheel line and end in the pedal zone: the
  // strip between the hubs around axle height.
  const legReaches = (item: { bounds: Bounds }) => item.bounds.minY < axleY - R * 0.8 && item.bounds.maxY >= axleY - R * 1.3 && item.bounds.maxY <= axleY + R * 0.8 && item.bounds.maxX > rearCx - WB * 0.2 && item.bounds.minX < frontCx + WB * 0.2;
  const legsToPedals = Boolean(wheels && (stroked.filter((item) => legReaches(item) && (span(item.bounds).h > R * 0.5 || span(item.bounds).w > WB * 0.15)).length >= 2 || stroked.some((item) => legReaches(item) && span(item.bounds).h > R * 1.2)));

  // The union of the warm geometry near the head classifies into exactly one
  // beak style, so a drawing can satisfy at most one beak check at a time.
  const beakUnion = beaks.reduce<Bounds | undefined>((all, item) => all ? { minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) } : item.bounds, undefined);
  const beakDim = beakUnion ? span(beakUnion) : { w: 0, h: 0 };
  const beakHasCurve = beaks.some((item) => item.element.curved);
  const headWidth = head ? head.rx * 2 : 0;
  // Every beak measure is relative to the head it hangs on, so the prompt can
  // state each check in plain terms ("a beak about as long as the head is
  // wide") and the same drawing earns the same class at any size.
  const beakStyle = (() => {
    if (!head || beaks.length === 0 || beakUnion === undefined) return undefined;
    const length = beakDim.w / headWidth, depth = beakDim.h / headWidth, ratio = beakDim.w / Math.max(beakDim.h, 1);
    if (pouchParts.length > 0) return "pouch beak";
    if (beakHasCurve) {
      if (length >= 1.2 && depth >= 0.35) return "large beak";
      if (length >= 0.85) return "thin curved beak";
      if (depth >= 0.55) return "tall colourful beak";
      return "hooked beak";
    }
    if (length >= 1.2 && depth >= 0.35) return "large beak";
    if (depth >= 0.55) return "tall colourful beak";
    if (length >= 1.6) return "long pointed beak";
    if (ratio >= 4 && length <= 1.05) return "flat beak";
    if (length >= 0.55) return "pointed beak";
    return "short beak";
  })();
  // Handlebars classify the same way: a drop curl wins, then a wide swept bar,
  // then a plain bar. Only one bar check can pass per drawing. The zone sits
  // over the front wheel in the band just above the axle line — no higher
  // than about half a wheelbase above the axles, as the prompt states — and
  // warm geometry is never a bar, so beaks, neck strokes and leg strokes
  // cannot read as handlebars.
  const barItems = wheels ? stroked.filter((item) => !warm(item.element.paint.fill) && item.bounds.minX > rearCx + WB * 0.45 && item.bounds.maxX > frontCx - WB * 0.45 && item.bounds.minY < axleY - R * 0.4 && item.bounds.maxY < axleY + R * 0.4 && item.bounds.minY > axleY - WB * 0.6 && span(item.bounds).w > R * 0.15) : [];
  const barStyle = barItems.some((item) => item.element.curved && span(item.bounds).h > span(item.bounds).w)
    ? "drop handlebars"
    : barItems.some((item) => item.element.curved && span(item.bounds).w > R * 0.5)
      ? "swept handlebars"
      : barItems.length > 0 ? "handlebars" : undefined;
  // Legs are drawn strokes hanging from inside the body toward the pedals;
  // wheels, tails, frame members and cargo boxes do not count. A tail sweeps
  // well left of the body, the frame spans the wheels, and a box sits ahead.
  const legStrokes = stroked.filter((item) => (item.element.name === "path" || item.element.name === "line" || item.element.name === "polyline") && item.bounds.minY > (body ? body.bounds.minY + body.ry * 0.2 : axleY - R * 3) && item.bounds.maxY > item.bounds.minY + R * 0.6 && item.bounds.minY < (body ? body.bounds.maxY + R * 0.4 : axleY - R) && (!body || (item.bounds.minX > body.bounds.minX - R * 0.4 && item.bounds.maxX <= body.bounds.maxX + R * 0.7)));

  // Long legs dangle: a thin leg stroke that leaves the body and drops at
  // least half a wheel radius below the wheel axles, the way a wading bird's
  // legs hang off a bicycle. A leg that merely reaches the pedals — anywhere
  // near the axle line, as the prompts state — is not a long leg.
  const longLeg = Boolean(wheels) && legStrokes.some((item) => {
    const h = span(item.bounds).h;
    const strokeWidth = number(item.element.paint["stroke-width"]) ?? h * 0.5;
    return strokeWidth <= h * 0.15 && item.bounds.maxY >= axleY + R * 0.5;
  });

  const knobby = Boolean(wheels && (wheelThickness(wheels![0]) || wheelThickness(wheels![1])));
  // A neck is a stroke bridging body to head that starts behind the head, so a
  // pouch or beak hanging ahead of the head cannot count.
  const neckStroke = body && head && stroked.find((item) => item.bounds !== head.bounds && item.bounds !== body.bounds && span(item.bounds).h > body.ry * 0.4 && span(item.bounds).w < WB * 0.6 && item.bounds.minX < head.cx && item.bounds.minY <= head.bounds.maxY + R * 0.3 && item.bounds.maxY >= body.bounds.minY - R * 0.3 && item.bounds.minY < body.bounds.minY);
  // A saddle is a small flat filled seat shape above the frame line, over the
  // rear wheel or between the wheels: ellipse, rect, or a filled path all
  // read as a seat. It is narrower than a wheel — a wider flat shape over the
  // rear wheel reads as a rack instead — and thinner than a box, so a battery
  // pack (at least a third as tall as it is wide) never counts.
  const saddleLike = (item: { element: Element; bounds: Bounds }) => {
    const { w, h } = span(item.bounds);
    if (w < R * 0.12 || w > R * 0.95 || h > Math.min(w * 0.6, R * 0.3)) return false;
    if (warm(item.element.paint.fill)) return false;
    const pathLike = item.element.name === "path" || item.element.name === "line" || item.element.name === "polyline";
    if (pathLike ? item.element.attrs.fill === undefined || item.element.attrs.fill === "none" : item.element.paint.fill === "none") return false;
    const cx = (item.bounds.minX + item.bounds.maxX) / 2, cy = (item.bounds.minY + item.bounds.maxY) / 2;
    return cx > rearCx - WB * 0.35 && cx < frontCx + WB * 0.1 && cy < axleY - R * 0.6 && cy > axleY - R * 3;
  };
  // The frame's top tube is the highest point of a frame stroke — a long
  // stroked line, path, or polyline spanning the wheels, never a filled
  // ellipse (a bird's body is wide enough to fake a frame otherwise). A
  // small filled shape within a wheel radius of it is seat hardware — a
  // saddle, a seat post top — never a tail, no matter where a narrow
  // upright body happens to sit. Small means at most the tail check's own
  // stated minimum (two fifths of a wheel radius): a taller shape is a
  // candidate tail, exactly as the prompt states.
  const frameMembers = stroked.filter((item) => item.element.name === "path" || item.element.name === "line" || item.element.name === "polyline");
  const frameTop = frameMembers
    .filter((item) => between(item) && span(item.bounds).w > WB * 0.4 && item.bounds.minY < axleY - R * 0.5)
    .reduce((top, item) => Math.min(top, item.bounds.minY), Infinity);
  const seatHardware = (item: { bounds: Bounds }) => {
    const { w, h } = span(item.bounds);
    return Number.isFinite(frameTop) && w <= R * 2 && h <= R * 0.4 && Math.abs(item.bounds.minY - frameTop) <= R;
  };
  const checks: Record<string, boolean> = {
    "two wheels": Boolean(wheels),
    "bicycle frame": Boolean(wheels && frameMembers.some((item) => between(item) && span(item.bounds).w > WB * 0.4 && item.bounds.minY < axleY - R * 0.5)),
    "handlebars": barItems.length > 0,
    "pedals": Boolean(wheels && geometry.some((item) => !wheelSet.has(item.element) && span(item.bounds).w <= R * 1.2 && span(item.bounds).h <= R * 1.2 && item.bounds.minX > rearCx && item.bounds.maxX < frontCx && (item.bounds.minY + item.bounds.maxY) / 2 > axleY - R * 1.6 && (item.bounds.minY + item.bounds.maxY) / 2 < axleY + R * 0.8)),
    "bird body": Boolean(body),
    "bird head": Boolean(head),
    "beak": beaks.length > 0,
    "legs reaching the pedals": legsToPedals,
    // Task-specific bird parts: the named animal's own cues.
    "long neck": Boolean(neckStroke),
    "short neck": Boolean(body && head && !neckStroke && head.bounds.maxY >= body.bounds.minY - R * 0.2),
    "upright body": Boolean(body && body.ry >= body.rx * 0.9),
    "level body": Boolean(body && body.ry < body.rx * 0.9),
    "long legs": longLeg,
    // A tail is a real fan: taller than two fifths of a wheel radius and
    // trailing just behind the body. Small shapes near the frame's top tube
    // are seat hardware, so a saddle under a narrow upright body never reads
    // as a tail.
    "tail feathers": Boolean(body && geometry.some((item) => item.element.paint.fill !== "none" && item.bounds.maxX < body.bounds.minX + body.rx * 0.35 && item.bounds.maxX > body.bounds.minX - body.rx * 1.5 && span(item.bounds).w > R * 0.2 && span(item.bounds).h > R * 0.4 && item.bounds.minY > body.bounds.minY && item.bounds.minY <= body.bounds.maxY && !seatHardware(item))),
    // Beak styles are exclusive: one drawing has exactly one beak shape.
    "pouch beak": beakStyle === "pouch beak",
    "large beak": beakStyle === "large beak",
    "long pointed beak": beakStyle === "long pointed beak",
    "pointed beak": beakStyle === "pointed beak",
    "flat beak": beakStyle === "flat beak",
    "thin curved beak": beakStyle === "thin curved beak",
    "hooked beak": beakStyle === "hooked beak",
    "tall colourful beak": beakStyle === "tall colourful beak",
    "short beak": beakStyle === "short beak",
    // Task-specific bicycle parts: the named vehicle's own cues.
    "drop handlebars": barStyle === "drop handlebars",
    "swept handlebars": barStyle === "swept handlebars",
    // Wheel size is measured against the wheelbase, as the prompt states:
    // small wheels have a radius under a seventh of the axle distance.
    "small wheels": Boolean(wheels && wheels[0].rx < WB / 7 && wheels[1].rx < WB / 7),
    "full-size wheels": Boolean(wheels && wheels[0].rx >= WB / 7 && wheels[1].rx >= WB / 7),
    "knobby tires": knobby,
    "smooth tires": Boolean(wheels) && !knobby,
    "fat tires": Boolean(wheels && (fatTires(wheels![0]) || fatTires(wheels![1]))),
    "second saddle": Boolean(wheels && geometry.filter(saddleLike).length >= 2),
    "cargo box": Boolean(wheels && geometry.some((item) => (item.element.name === "rect" || item.element.name === "polygon") && item.element.paint.fill !== "none" && !warm(item.element.paint.fill) && span(item.bounds).w > R * 0.8 && span(item.bounds).h > R * 0.5 && item.bounds.minX < frontCx + R && item.bounds.maxX > frontCx - R && item.bounds.minY < axleY - R && item.bounds.minY > axleY - R * 2.5 && item.bounds.maxY < axleY - R * 0.3)),
    // A rack is a wide thin shelf right over the rear wheel, at least as wide
    // as a wheel: a smaller flat shape in the same spot reads as a saddle.
    "rear rack": Boolean(wheels && geometry.some((item) => item.element.name === "rect" && item.element.paint.fill !== "none" && span(item.bounds).w >= R && span(item.bounds).h <= R * 0.4 && span(item.bounds).w > span(item.bounds).h * 3 && Math.abs((item.bounds.minX + item.bounds.maxX) / 2 - rearCx) <= WB * 0.35 && item.bounds.minY > axleY - R * 2.5 && item.bounds.minY < wheels![0].bounds.minY - R * 0.05 && item.bounds.maxY < axleY - R * 0.3)),
    "battery pack": Boolean(wheels && geometry.some((item) => item.element.name === "rect" && item.element.paint.fill !== "none" && span(item.bounds).w >= R * 0.9 && span(item.bounds).h >= Math.max(R * 0.3, span(item.bounds).w * 0.3) && item.bounds.minX > rearCx - WB * 0.1 && item.bounds.maxX < frontCx + WB * 0.1 && item.bounds.maxY < axleY - R * 0.2 && item.bounds.minY > axleY - R * 2.8)),
  };
  function wheelThickness(wheel: Round) {
    const strokeWidth = number(wheel.element.paint["stroke-width"]) ?? 0;
    // Knobby tread shows as a tyre wall at least 0.28 times the wheel radius
    // thick — thicker is fine — a dashed tread line, or a concentric outer
    // ring hugging the rim.
    return strokeWidth >= wheel.rx * 0.28
      || (wheel.element.paint["stroke-dasharray"] !== undefined && wheel.element.paint["stroke-dasharray"] !== "none")
      || rounds.some((round) => round !== wheel && Math.abs(round.cx - wheel.cx) < wheel.rx * 0.15 && Math.abs(round.cy - wheel.cy) < wheel.rx * 0.15 && round.rx > wheel.rx && round.rx < wheel.rx * 1.3);
  }
  function fatTires(wheel: Round) {
    const strokeWidth = number(wheel.element.paint["stroke-width"]) ?? 0;
    return strokeWidth >= wheel.rx * 0.33;
  }
  return { checks, head, beaks };
}

// Shared checks form the structural gate; every task asks for all of them.
const SHARED_WEIGHTS: Record<string, number> = {
  "two wheels": 0.15, "bicycle frame": 0.11, "handlebars": 0.06, "pedals": 0.05,
  "bird body": 0.12, "bird head": 0.07, "beak": 0.1, "legs reaching the pedals": 0.05,
};
const BASE_CHECKS: Array<[string, number]> = [["svg canvas", 0.05], ["complexity", 0.08], ["coverage", 0.02]];
// Every other check is task-specific: it separates one named animal or vehicle
// from another. Missing a required part, or drawing an unrequested one, scales
// the task fit by MISS_FACTOR each.
const MISS_FACTOR = 0.4;
const SPECIFIC_CHECKS = new Set([
  "long neck", "short neck", "upright body", "level body", "long legs", "tail feathers",
  "pouch beak", "large beak", "long pointed beak", "pointed beak", "flat beak",
  "thin curved beak", "hooked beak", "tall colourful beak", "short beak",
  "drop handlebars", "swept handlebars", "small wheels", "full-size wheels",
  "knobby tires", "smooth tires", "fat tires", "second saddle", "cargo box", "rear rack", "battery pack",
]);
const DEFAULT_PARTS = Object.keys(SHARED_WEIGHTS);

export function safeSvg(answer: string): string | undefined {
  return typeof scan(answer) === "string" ? undefined : extract(answer);
}

export function gradeSvg(answer: unknown, task?: Task): TaskScore {
  if (typeof answer !== "string" || answer.trim() === "") return { score: 0, reason: "No SVG answer was provided." };
  const scanned = scan(answer);
  if (typeof scanned === "string") return { score: 0, reason: `Invalid SVG: ${scanned}.` };
  const { scene } = scanned;
  const { width, height, geometry } = scene;
  const { checks, head, beaks } = sceneChecks(scene);
  const requested = (task?.metadata?.requiredParts as string[] | undefined) ?? DEFAULT_PARTS;
  const parts = requested.filter((part) => checks[part] !== undefined);
  const rows: Array<{ name: string; weight: number; passed: boolean; kind: "gate" | "task" }> = [];
  const missed: string[] = [];
  for (const part of parts) {
    const kind = SHARED_WEIGHTS[part] === undefined ? "task" : "gate";
    const passed = checks[part] === true;
    if (!passed && kind === "task") missed.push(part);
    rows.push({ name: part, weight: kind === "gate" ? SHARED_WEIGHTS[part]! : 1, passed, kind });
  }
  // Shared base rows ride along in the gate as well.
  for (const [name, weight] of BASE_CHECKS) {
    const passed = name === "svg canvas" ? true : name === "complexity" ? scene.sceneShapes.length >= 8 && scene.sceneShapes.length <= 200 : Boolean(width > 0 && height > 0 && width >= height * 0.8 && height >= width * 0.2);
    rows.push({ name, weight, passed, kind: "gate" });
  }
  // Unrequested task-specific parts that were drawn anyway count against fit.
  // A fat tire is a stronger form of a rugged tire, so when a task asks for
  // knobby tires an even thicker stroke is not an unrequested part.
  const implied: Record<string, string[]> = { "fat tires": ["knobby tires"] };
  const unexpected = [...SPECIFIC_CHECKS].filter((name) => !parts.includes(name) && checks[name] === true && !(implied[name] ?? []).some((weaker) => parts.includes(weaker)));
  const gateTotal = rows.filter((row) => row.kind === "gate").reduce((sum, row) => sum + row.weight, 0);
  const gate = gateTotal === 0 ? 1 : rows.filter((row) => row.kind === "gate").reduce((sum, row) => sum + (row.passed ? row.weight : 0), 0) / gateTotal;
  const taskFit = Math.pow(MISS_FACTOR, missed.length + unexpected.length);
  let score = gate * taskFit;
  const caps: string[] = [];
  const bicycleEvidence = Boolean(scene.wheels) || checks["bicycle frame"] === true;
  const birdEvidence = Boolean(head && beaks.length > 0) || beaks.length > 0 && checks["bird body"] === true;
  if (!bicycleEvidence) { score = Math.min(score, 0.2); caps.push("no bicycle geometry"); }
  if (!birdEvidence) { score = Math.min(score, 0.2); caps.push("no bird with a beak"); }
  const rounded = Math.round(score * 100) / 100;
  const passed = rows.filter((row) => row.passed).map((row) => row.name);
  const failedGate = rows.filter((row) => !row.passed && row.kind === "gate").map((row) => row.name);
  const reason = `Gate ${gate.toFixed(2)} x task fit ${taskFit.toFixed(2)}. Passed: ${passed.join(", ")}. Missed: ${[...failedGate, ...missed].join(", ") || "none"}.${unexpected.length ? ` Unrequested: ${unexpected.join(", ")}.` : ""}${caps.length ? ` Capped: ${caps.join("; ")}.` : ""}`;
  return { score: rounded, reason, details: { checks: rows, gate: Math.round(gate * 1000) / 1000, taskFit, missed, unexpected, caps, extent: { minX: Math.round(scene.extent.minX), minY: Math.round(scene.extent.minY), maxX: Math.round(scene.extent.maxX), maxY: Math.round(scene.extent.maxY) } } as JsonValue };
}
