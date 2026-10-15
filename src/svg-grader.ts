import type { TaskScore } from "benchmark-core";

const LIMIT = 50 * 1024;
const SHAPES = new Set(["circle", "ellipse", "line", "path", "polygon", "polyline", "rect"]);
interface Element { name: string; attrs: Record<string, string>; numbers: number[]; }
interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) result[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? "";
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
  if (numbers.length < 4) return undefined;
  const xs = numbers.filter((_value, index) => index % 2 === 0);
  const ys = numbers.filter((_value, index) => index % 2 === 1);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function scan(svg: string): { elements: Element[]; canvas: Bounds } | string {
  if (Buffer.byteLength(svg, "utf8") > LIMIT) return "answer exceeds 50 KiB";
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) return "answer must contain only one SVG root";
  if (/<!|<\?|&(?:#\d+|#x[\da-f]+|\w+);/i.test(svg)) return "declarations and entities are not allowed";
  if (/<\s*(?:script|foreignObject|image)\b/i.test(svg)) return "active or external content is not allowed";
  if (/\son[a-z]+\s*=|\burl\s*\(|\b(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) return "event handlers and external references are not allowed";

  const tags = [...svg.matchAll(/<\s*(\/)?\s*([a-z][\w:-]*)\b([^<>]*?)(\/)?\s*>/gi)];
  if (tags.length === 0 || tags.map((tag) => tag[0]).join("") !== svg.replace(/>\s+</g, "><")) return "SVG contains text or malformed markup";
  const stack: string[] = [];
  const elements: Element[] = [];
  for (const tag of tags) {
    const closing = Boolean(tag[1]);
    const name = tag[2]!.toLowerCase();
    if (closing) {
      if (stack.pop() !== name) return "SVG tags are unbalanced";
      continue;
    }
    const attrs = attributes(tag[3] ?? "");
    if (Object.keys(attrs).some((key) => key.startsWith("on"))) return "event handlers are not allowed";
    const numericSource = attrs.d ?? attrs.points ?? "";
    const numbers = [...numericSource.matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)].map((match) => Number(match[0]));
    elements.push({ name, attrs, numbers });
    if (!tag[4]) stack.push(name);
  }
  if (stack.length !== 0 || elements[0]?.name !== "svg" || elements.filter((element) => element.name === "svg").length !== 1) return "SVG must have one balanced root";
  const root = elements[0];
  const viewBox = root?.attrs.viewbox?.trim().split(/[ ,]+/).map(Number);
  let canvas: Bounds | undefined;
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0) canvas = { minX: viewBox[0]!, minY: viewBox[1]!, maxX: viewBox[0]! + viewBox[2]!, maxY: viewBox[1]! + viewBox[3]! };
  else {
    const width = number(root?.attrs.width), height = number(root?.attrs.height);
    if (width && height && width > 0 && height > 0) canvas = { minX: 0, minY: 0, maxX: width, maxY: height };
  }
  return canvas ? { elements, canvas } : "SVG root needs positive dimensions or viewBox";
}

function warm(fill: string | undefined): boolean {
  if (!fill) return false;
  const value = fill.toLowerCase().replaceAll(" ", "");
  return /(orange|yellow|gold|#f[0-9a-f]{2}[0-9a-f]{3}|#e9c46a|#f4a261|rgb\(2[0-9]{2},(?:1[0-9]{2}|[6-9][0-9]),[0-9]{1,2}\))/.test(value);
}

export function gradeSvg(answer: unknown): TaskScore {
  if (typeof answer !== "string" || answer.trim() === "") return { score: 0, reason: "No SVG answer was provided." };
  const scanned = scan(answer.trim());
  if (typeof scanned === "string") return { score: 0, reason: `Invalid SVG: ${scanned}.` };
  const { elements, canvas } = scanned;
  const width = canvas.maxX - canvas.minX, height = canvas.maxY - canvas.minY;
  const geometry = elements.filter((element) => SHAPES.has(element.name)).map((element) => ({ element, bounds: bounds(element) })).filter((item): item is { element: Element; bounds: Bounds } => item.bounds !== undefined);
  const rounds = geometry.filter(({ element }) => element.name === "circle" || element.name === "ellipse").map((item) => {
    const cx = (item.bounds.minX + item.bounds.maxX) / 2, cy = (item.bounds.minY + item.bounds.maxY) / 2;
    return { ...item, cx, cy, rx: (item.bounds.maxX - item.bounds.minX) / 2, ry: (item.bounds.maxY - item.bounds.minY) / 2 };
  });
  const wheelCandidates = rounds.filter((round) => round.cy > canvas.minY + height * 0.55 && round.rx > width * 0.035 && round.ry > height * 0.05);
  let wheels: [typeof wheelCandidates[number], typeof wheelCandidates[number]] | undefined;
  for (const left of wheelCandidates) for (const right of wheelCandidates) {
    const ratio = Math.max(left.rx, right.rx) / Math.min(left.rx, right.rx);
    if (right.cx - left.cx > width * 0.3 && ratio <= 1.35) wheels = [left, right];
  }
  const between = (item: { bounds: Bounds }) => wheels && item.bounds.minX <= wheels[1].cx && item.bounds.maxX >= wheels[0].cx;
  const stroked = geometry.filter(({ element }) => element.attrs.stroke && element.attrs.stroke !== "none");
  const frame = Boolean(wheels && stroked.some((item) => between(item) && item.bounds.maxX - item.bounds.minX > (wheels![1].cx - wheels![0].cx) * 0.4 && item.bounds.minY < wheels![0].cy - height * 0.08));
  const handlebars = Boolean(wheels && stroked.some((item) => item.bounds.minY < wheels![0].cy - height * 0.18 && item.bounds.maxY < wheels![0].cy && item.bounds.maxX > (wheels![0].cx + wheels![1].cx) / 2 && item.bounds.maxX - item.bounds.minX > width * 0.04));
  const pedals = Boolean(wheels && rounds.some((round) => round.rx < wheels![0].rx * 0.4 && round.rx > width * 0.008 && round.cx > wheels![0].cx && round.cx < wheels![1].cx && round.cy < wheels![0].cy && round.cy > wheels![0].cy - height * 0.25));
  const bodies = rounds.filter((round) => round.cy < canvas.minY + height * 0.58 && round.rx > width * 0.05 && round.ry > height * 0.06);
  const beak = geometry.some((item) => warm(item.element.attrs.fill) && item.bounds.minY < canvas.minY + height * 0.5 && item.bounds.maxX - item.bounds.minX > width * 0.06);
  const legs = stroked.some((item) => warm(item.element.attrs.stroke) && item.bounds.minY < canvas.minY + height * 0.58 && item.bounds.maxY > canvas.minY + height * 0.65 && item.bounds.maxY - item.bounds.minY > height * 0.12);
  const useful = geometry.filter((item) => !(item.element.name === "rect" && item.bounds.maxX - item.bounds.minX > width * 0.9 && item.bounds.maxY - item.bounds.minY > height * 0.9));
  const extent = useful.length ? useful.reduce((all, item) => ({ minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) }), useful[0]!.bounds) : undefined;
  const checks: Array<[string, number, boolean]> = [
    ["canvas", 0.10, true], ["complexity", 0.10, geometry.length >= 12 && geometry.length <= 200],
    ["wheels", 0.20, Boolean(wheels)], ["frame", 0.14, frame], ["handlebars", 0.08, handlebars],
    ["pedals", 0.08, pedals], ["bird body", 0.12, bodies.length > 0], ["beak", 0.12, beak], ["legs", 0.04, legs],
    ["coverage", 0.02, Boolean(extent && extent.maxX - extent.minX > width * 0.5 && extent.maxY - extent.minY > height * 0.5)],
  ];
  const score = checks.reduce((sum, [, weight, passed]) => sum + (passed ? weight : 0), 0);
  const passed = checks.filter(([, , value]) => value).map(([name]) => name);
  const missed = checks.filter(([, , value]) => !value).map(([name]) => name);
  return { score: Math.round(score * 100) / 100, reason: `Passed: ${passed.join(", ")}. Missed: ${missed.join(", ") || "none"}.` };
}
