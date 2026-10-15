import { readdir, readFile, writeFile } from "node:fs/promises";
const htmlEscape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

let files = process.argv.slice(2);
if (files.length === 0) {
  files = (await readdir("artifacts", { withFileTypes: true })).filter((item) => item.isFile() && item.name.endsWith(".json")).map((item) => `artifacts/${item.name}`);
}
const cards = [];
for (const file of files) {
  const report = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(report.rows)) continue;
  for (const row of report.rows) {
    const svg = row.submission?.answer;
    if (typeof svg !== "string" || !svg.trim().startsWith("<svg") || /<\s*(?:script|foreignObject|image)\b|\son[a-z]+\s*=|\burl\s*\(/i.test(svg)) continue;
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cards.push(`<article><img src="${source}" alt="Submitted drawing for ${htmlEscape(row.taskId)}"><h2>${htmlEscape(row.taskId)}</h2><p>${Math.round(row.score * 100)}% · ${htmlEscape(report.model)}</p></article>`);
  }
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pelican benchmark gallery</title><style>body{margin:0;background:#0b1020;color:#e2e8f0;font:16px system-ui;padding:2rem}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.2rem}article{background:#172033;border-radius:16px;padding:1rem}img{width:100%;aspect-ratio:4/3;object-fit:contain;background:white;border-radius:10px}h2{font-size:1rem;overflow-wrap:anywhere}p{color:#7dd3fc}</style><h1>Pelican benchmark gallery</h1><p>${cards.length} saved submissions</p><main>${cards.join("")}</main></html>`;
await writeFile("artifacts/gallery.html", html);
console.log(`gallery: ${cards.length} drawings -> artifacts/gallery.html, ok`);
