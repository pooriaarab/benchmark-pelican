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
  // the drawing, so it never reaches the extent.
  const canvasWidth = canvas.maxX - canvas.minX, canvasHeight = canvas.maxY - canvas.minY;
  const useful = geometry.filter((item) => !(item.element.name === "rect" && item.bounds.maxX - item.bounds.minX > canvasWidth * 0.9 && item.bounds.maxY - item.bounds.minY > canvasHeight * 0.9));
  const preliminary = useful.length
    ? useful.reduce((all, item) => ({ minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) }), { ...useful[0]!.bounds })
    : { ...canvas };
  const pw = preliminary.maxX - preliminary.minX, ph = preliminary.maxY - preliminary.minY;
  const rounds = geometry.filter(({ element }) => element.name === "circle" || element.name === "ellipse").map((item) => ({ ...item, cx: (item.bounds.minX + item.bounds.maxX) / 2, cy: (item.bounds.minY + item.bounds.maxY) / 2, rx: (item.bounds.maxX - item.bounds.minX) / 2, ry: (item.bounds.maxY - item.bounds.minY) / 2 }));
  const stroked = geometry.filter(({ element }) => element.paint.stroke && element.paint.stroke !== "none");
  const wheelCandidates = rounds.filter((round) => round.cy > preliminary.minY + ph * 0.5 && round.rx > pw * 0.025 && round.ry > ph * 0.035);
  let wheels: [Round, Round] | undefined;
  for (const left of wheelCandidates) for (const right of wheelCandidates) {
    const ratio = Math.max(left.rx, right.rx) / Math.min(left.rx, right.rx);
    if (right.cx - left.cx > pw * 0.3 && ratio <= 1.35 && (!wheels || right.cx - left.cx > wheels[1].cx - wheels[0].cx)) wheels = [left, right];
  }
  // The drawing's own extent is the bounding box of the connected
  // bird-plus-vehicle figure only. A long thin horizontal stroke (a ground
  // line or a horizon) is decoration, and so is a shape farther than one
  // wheel diameter from the vehicle or the bird, or one that does not touch
  // the figure at all: a sun or a cloud can come and go without moving a
  // check. Every geometric check below is measured against this extent or
  // against named parts inside the scene, never against the canvas or
  // viewBox, so scaling or translating the scene changes nothing.
  const wheelSpan = wheels ? wheels[1].cx - wheels[0].cx : 0;
  const members = useful.filter((item) => {
    const w = item.bounds.maxX - item.bounds.minX, h = item.bounds.maxY - item.bounds.minY;
    return h > Math.max(6, ph * 0.08) || (w < pw * 0.8 && (!wheels || w < wheelSpan * 1.25));
  });
  let sceneShapes = members;
  if (wheels) {
    const diameter = Math.max(wheels[0].rx, wheels[1].rx) * 2;
    const pad = Math.max(2, diameter * 0.03);
    const wheelRegion = {
      minX: wheels[0].cx - wheels[0].rx, minY: Math.min(wheels[0].bounds.minY, wheels[1].bounds.minY),
      maxX: wheels[1].cx + wheels[1].rx, maxY: Math.max(wheels[0].bounds.maxY, wheels[1].bounds.maxY),
    };
    // The bird anchor is the largest member round above the vehicle — the
    // body wins it. A shape joins the figure only when it sits within one
    // wheel diameter of the wheels or of that anchor AND touches what is
    // already connected (the hairline pad covers anti-aliasing gaps). A sun
    // or a cloud near the bird fails one test or the other, so decoration
    // can never join the extent and flip a check.
    const edgeGap = (a: Bounds, b: Bounds) => Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX, a.minY - b.maxY, b.minY - a.maxY));
    const anchor = members
      .filter((item) => (item.element.name === "circle" || item.element.name === "ellipse") && item.element !== wheels[0].element && item.element !== wheels[1].element && (item.bounds.minY + item.bounds.maxY) / 2 < wheelRegion.minY)
      .reduce<{ element: Element; bounds: Bounds } | undefined>((best, item) => !best || span(item.bounds).w * span(item.bounds).h > span(best.bounds).w * span(best.bounds).h ? item : best, undefined);
    const near = (b: Bounds) => edgeGap(b, wheelRegion) <= diameter || (anchor !== undefined && edgeGap(b, anchor.bounds) <= diameter);
    const inScene = new Set<number>();
    const queue: number[] = [];
    members.forEach((item, index) => {
      if (item.element === wheels[0].element || item.element === wheels[1].element) { inScene.add(index); queue.push(index); }
    });
    while (queue.length) {
      const item = members[queue.pop()!]!;
      for (let index = 0; index < members.length; index++) {
        if (inScene.has(index)) continue;
        const b = members[index]!.bounds;
        if (near(b) && overlap(item.bounds, b, pad)) { inScene.add(index); queue.push(index); }
      }
    }
    sceneShapes = members.filter((_item, index) => inScene.has(index));
  }
  const extent = sceneShapes.length
    ? sceneShapes.reduce((all, item) => ({ minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) }), { ...sceneShapes[0]!.bounds })
    : preliminary;
  const width = extent.maxX - extent.minX, height = extent.maxY - extent.minY;
  return { scene: { extent, width, height, geometry, rounds, stroked, wheels, sceneShapes, frameTop: wheels ? wheels[0].cy - height * 0.08 : extent.minY + height * 0.7 } };
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
  const { extent, width, height, wheels } = scene;
  // Part checks only see the connected figure: decoration that stays outside
  // the scene — a sun, a cloud — cannot fake a part or poison one (a warm
  // disc near the head must not join the beak union).
  const member = new Set(scene.sceneShapes.map((item) => item.element));
  const geometry = scene.geometry.filter((item) => member.has(item.element));
  const rounds = scene.rounds.filter((item) => member.has(item.element));
  const stroked = scene.stroked.filter((item) => member.has(item.element));
  const wheelbase = wheels ? wheels[1].cx - wheels[0].cx : width * 0.5;
  const between = (item: { bounds: Bounds }) => wheels && item.bounds.minX <= wheels[1].cx && item.bounds.maxX >= wheels[0].cx;
  const upper = (item: { bounds: Bounds }) => item.bounds.minY < extent.minY + height * 0.55;
  const bodies = rounds.filter((round) => round.cy < extent.minY + height * 0.55 && round.rx > width * 0.045 && round.ry > height * 0.05 && (!wheels || round.cy < wheels[0].cy - height * 0.1));
  // The body is the largest upper-region round, so a head circle cannot win.
  const body = bodies.reduce<Round | undefined>((best, round) => !best || round.rx * round.ry > best.rx * best.ry ? round : best, undefined);
  const head = body && rounds.find((round) => round !== body && round.rx >= width * 0.012 && round.rx <= Math.max(body.rx * 0.75, width * 0.02) && round.ry <= Math.max(body.ry * 0.9, height * 0.03) && round.cy < body.cy - Math.min(4, height * 0.01) && round.cx > body.cx - body.rx * 0.35 && round.cx < extent.maxX);
  // Warm candidates come from the full geometry: a long beak can reach past
  // the scene's distance rule and still be a beak. But a beak element must
  // overlap the head it hangs from — a warm sun or cloud floating near the
  // head never enters the beak union and cannot reclassify it. The only
  // second hop is a pouch: warm geometry that overlaps an attached beak and
  // hangs below the head's centre line.
  const warms = scene.geometry.filter((item) => warm(item.element.paint.fill) && upper(item) && span(item.bounds).w > width * 0.02);
  const headPad = head ? { minX: head.bounds.minX - head.rx * 0.2, minY: head.bounds.minY - head.rx * 0.2, maxX: head.bounds.maxX + head.rx * 0.2, maxY: head.bounds.maxY + head.rx * 0.2 } : undefined;
  const attached = headPad ? warms.filter((item) => overlap(item.bounds, headPad)) : warms;
  const beaks = head ? warms.filter((item) => attached.includes(item) || attached.some((other) => overlap(item.bounds, other.bounds) && item.bounds.minY > head.cy)) : attached;
  const pedalZone = wheels ? { minX: wheels[0].cx, minY: wheels[0].cy - height * 0.3, maxX: wheels[1].cx, maxY: wheels[0].cy } : undefined;
  const legReaches = (item: { bounds: Bounds }, zone: Bounds) => item.bounds.minY > extent.minY + height * 0.28 && item.bounds.minY < extent.minY + height * 0.72 && item.bounds.maxY >= zone.minY + height * 0.12 && item.bounds.maxY <= zone.maxY + height * 0.08 && item.bounds.maxX > zone.minX - width * 0.1 && item.bounds.minX < zone.maxX + width * 0.1;
  const legsToPedals = Boolean(pedalZone && (stroked.filter((item) => legReaches(item, pedalZone) && (span(item.bounds).h > height * 0.12 || span(item.bounds).w > width * 0.06)).length >= 2 || stroked.some((item) => legReaches(item, pedalZone) && span(item.bounds).h > height * 0.14)));

  const barZone = (item: { bounds: Bounds }) => Boolean(wheels && item.bounds.minY < wheels[0].cy - height * 0.15 && item.bounds.maxY < wheels[0].cy + height * 0.02 && item.bounds.maxX > wheels[1].cx - wheelbase * 0.45 && span(item.bounds).w > width * 0.03);
  // The union of the warm geometry near the head classifies into exactly one
  // beak style, so a drawing can satisfy at most one beak check at a time.
  const beakUnion = beaks.reduce<Bounds | undefined>((all, item) => all ? { minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) } : item.bounds, undefined);
  const beakDim = beakUnion ? span(beakUnion) : { w: 0, h: 0 };
  const beakHasCurve = beaks.some((item) => item.element.curved);
  // A pouch is a second warm shape hanging clearly below the rest of the beak.
  const headWidth = head ? head.rx * 2 : 0;
  const pouch = Boolean(head && beaks.some((item, i) => beaks.some((other, j) => i !== j && overlap(item.bounds, other.bounds, width * 0.02) && other.bounds.minY > item.bounds.minY + head.rx * 0.15)));
  // Every beak measure is relative to the head it hangs on, so the prompt can
  // state each check in plain terms ("a beak about as long as the head is
  // wide") and the same drawing earns the same class at any size.
  const beakStyle = (() => {
    if (!head || beaks.length === 0 || beakUnion === undefined) return undefined;
    const length = beakDim.w / headWidth, depth = beakDim.h / headWidth, ratio = beakDim.w / Math.max(beakDim.h, 1);
    if (pouch) return "pouch beak";
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
  // then a plain bar. Only one bar check can pass per drawing. The zone sits in
  // the front half of the bicycle and in the band just above the wheel line —
  // no higher than about half a wheelbase above the axles, as the prompt
  // states — and warm geometry is never a bar, so beaks, neck strokes and leg
  // strokes cannot read as handlebars.
  const barItems = wheels ? stroked.filter((item) => !warm(item.element.paint.fill) && barZone(item) && item.bounds.minX > wheels[0].cx + wheelbase * 0.5 && item.bounds.minY > wheels[0].cy - wheelbase * 0.55) : [];
  const barStyle = barItems.some((item) => item.element.curved && span(item.bounds).h > span(item.bounds).w)
    ? "drop handlebars"
    : barItems.some((item) => item.element.curved && span(item.bounds).w > width * 0.07)
      ? "swept handlebars"
      : barItems.length > 0 ? "handlebars" : undefined;
  // Legs are drawn strokes hanging from inside the body toward the pedals;
  // wheels, tails, frame members and cargo boxes do not count. A tail sweeps
  // well left of the body, the frame spans the wheels, and a box sits ahead.
  const legStrokes = stroked.filter((item) => (item.element.name === "path" || item.element.name === "line" || item.element.name === "polyline") && item.bounds.minY > (body ? body.bounds.minY + body.ry * 0.2 : extent.minY + height * 0.35) && item.bounds.maxY > item.bounds.minY + height * 0.1 && item.bounds.minY < (body ? body.bounds.maxY + height * 0.06 : extent.minY + height * 0.7) && (!body || (item.bounds.minX > body.bounds.minX - width * 0.05 && item.bounds.maxX <= body.bounds.maxX + width * 0.1)));

  // Long legs dangle: a thin leg stroke that leaves the body and drops clearly
  // below the wheel axles, the way a wading bird's legs hang off a bicycle.
  const longLeg = Boolean(wheels) && legStrokes.some((item) => {
    const h = span(item.bounds).h;
    const strokeWidth = number(item.element.paint["stroke-width"]) ?? h * 0.5;
    return strokeWidth <= h * 0.15 && item.bounds.maxY >= wheels![0].cy + wheels![0].rx * 0.15;
  });

  const knobby = Boolean(wheels && (wheelThickness(wheels![0]) || wheelThickness(wheels![1])));
  // A neck is a stroke bridging body to head that starts behind the head, so a
  // pouch or beak hanging ahead of the head cannot count.
  const neckStroke = body && head && stroked.find((item) => item.bounds !== head.bounds && item.bounds !== body.bounds && span(item.bounds).h > body.ry * 0.4 && span(item.bounds).w < wheelbase * 0.6 && item.bounds.minX < head.cx && item.bounds.minY <= head.bounds.maxY + height * 0.05 && item.bounds.maxY >= body.bounds.minY - height * 0.05 && item.bounds.minY < body.bounds.minY);
  const checks: Record<string, boolean> = {
    "two wheels": Boolean(wheels),
    "bicycle frame": Boolean(wheels && stroked.some((item) => between(item) && span(item.bounds).w > wheelbase * 0.4 && item.bounds.minY < scene.frameTop)),
    "handlebars": barItems.length > 0,
    "pedals": Boolean(wheels && geometry.some((item) => span(item.bounds).w <= wheels![0].rx * 1.1 && span(item.bounds).h <= wheels![0].rx * 1.1 && item.bounds.minX > wheels![0].cx && item.bounds.maxX < wheels![1].cx && (item.bounds.minY + item.bounds.maxY) / 2 > wheels![0].cy - height * 0.25 && (item.bounds.minY + item.bounds.maxY) / 2 < wheels![0].cy + wheels![0].rx * 0.6)),
    "bird body": Boolean(body),
    "bird head": Boolean(head),
    "beak": beaks.length > 0,
    "legs reaching the pedals": legsToPedals,
    // Task-specific bird parts: the named animal's own cues.
    "long neck": Boolean(neckStroke),
    "short neck": Boolean(body && head && !neckStroke && head.bounds.maxY >= body.bounds.minY - height * 0.02),
    "upright body": Boolean(body && body.ry >= body.rx * 0.9),
    "level body": Boolean(body && body.ry < body.rx * 0.9),
    "long legs": longLeg,
    "tail feathers": Boolean(body && geometry.some((item) => item.element.paint.fill !== "none" && item.bounds.maxX < body.bounds.minX + width * 0.06 && span(item.bounds).w > width * 0.04 && span(item.bounds).h > height * 0.05 && item.bounds.minY > body.bounds.minY && item.bounds.minY <= body.bounds.maxY)),
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
    // Wheel size is measured against the scene's height, so a wider drawing or
    // a longer beak cannot make the same wheels look smaller.
    "small wheels": Boolean(wheels && wheels[0].rx < height * 0.14 && wheels[1].rx < height * 0.14),
    "full-size wheels": Boolean(wheels && wheels[0].rx >= height * 0.14 && wheels[1].rx >= height * 0.14),
    "knobby tires": knobby,
    "smooth tires": Boolean(wheels) && !knobby,
    "fat tires": Boolean(wheels && (fatTires(wheels![0]) || fatTires(wheels![1]))),
    // A saddle is any small flat seat shape between the wheels in the saddle
    // band — an ellipse or a flat rect both read as a seat. Two of them mean
    // a second rider position, as the prompt states for a tandem.
    "second saddle": Boolean(wheels && geometry.filter((item) => {
      const { w, h } = span(item.bounds);
      if (item.element.name !== "circle" && item.element.name !== "ellipse" && item.element.name !== "rect") return false;
      if (w <= width * 0.02 || w >= wheels![0].rx || h > w * 0.55) return false;
      const cx = (item.bounds.minX + item.bounds.maxX) / 2, cy = (item.bounds.minY + item.bounds.maxY) / 2;
      return cx > wheels![0].cx && cx < wheels![1].cx && cy > wheels![0].cy - height * 0.3 && cy < wheels![0].cy - height * 0.12;
    }).length >= 2),
    "cargo box": Boolean(wheels && geometry.some((item) => (item.element.name === "rect" || item.element.name === "polygon") && item.element.paint.fill !== "none" && span(item.bounds).w > width * 0.08 && span(item.bounds).h > height * 0.1 && item.bounds.minY < wheels![0].cy - height * 0.05 && item.bounds.minY > wheels![0].cy - height * 0.55 && overlap(item.bounds, { minX: wheels![0].cx - width * 0.08, minY: extent.minY, maxX: wheels![1].cx + width * 0.12, maxY: extent.maxY }))),
    "rear rack": Boolean(wheels && geometry.some((item) => item.element.name === "rect" && span(item.bounds).w > width * 0.07 && span(item.bounds).h < height * 0.06 && item.bounds.maxX < wheels![0].cx + wheels![0].rx + width * 0.06 && item.bounds.minY > wheels![0].bounds.minY - height * 0.12 && item.bounds.maxY < wheels![0].cy)),
    "battery pack": Boolean(wheels && geometry.some((item) => item.element.name === "rect" && item.element.paint.fill !== "none" && span(item.bounds).w >= wheels![0].rx * 0.9 && span(item.bounds).h > height * 0.03 && item.bounds.minX > wheels![0].cx && item.bounds.maxX < wheels![1].cx && item.bounds.maxY < wheels![0].cy && item.bounds.minY > extent.minY + height * 0.25)),
  };
  function wheelThickness(wheel: Round) {
    const strokeWidth = number(wheel.element.paint["stroke-width"]) ?? 0;
    // Knobby tread shows as a thick tyre wall, a dashed tread line, or a
    // concentric outer ring hugging the rim.
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
    const passed = name === "svg canvas" ? true : name === "complexity" ? geometry.length >= 12 && geometry.length <= 200 : Boolean(width > 0 && height > 0 && width >= height * 0.8 && height >= width * 0.2);
    rows.push({ name, weight, passed, kind: "gate" });
  }
  // Unrequested task-specific parts that were drawn anyway count against fit.
  const unexpected = [...SPECIFIC_CHECKS].filter((name) => !parts.includes(name) && checks[name] === true);
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
