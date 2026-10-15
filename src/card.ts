import type { RunReport } from "benchmark-core";
import { gradeSvg } from "./svg-grader.js";

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderPelicanCard(report: RunReport): string {
  const candidate = report.rows.find((row) => typeof row.submission?.answer === "string" && gradeSvg(row.submission.answer).score >= 0.5)?.submission?.answer;
  const drawing = typeof candidate === "string"
    ? candidate.trim().replace(/^<svg\b/, '<svg x="680" y="120" width="450" height="390" preserveAspectRatio="xMidYMid meet"')
    : '<svg x="680" y="120" width="450" height="390" viewBox="0 0 450 390"><rect width="450" height="390" rx="24" fill="#e2e8f0"/><text x="225" y="205" text-anchor="middle" fill="#475569" font-family="system-ui,sans-serif" font-size="24">No passing SVG</text></svg>';
  const score = `${Math.round(report.mean * 100)}%`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${xml(report.benchmark.name)} score ${score}"><rect width="1200" height="630" fill="#0b1020"/><text x="60" y="90" fill="#7dd3fc" font-family="system-ui,sans-serif" font-size="26">AI BENCHMARK INDEX</text><text x="60" y="175" fill="white" font-family="system-ui,sans-serif" font-size="48" font-weight="700">Pelican Bicycle SVG</text><text x="60" y="235" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="27">${xml(report.model)}</text><text x="60" y="440" fill="#a7f3d0" font-family="system-ui,sans-serif" font-size="112" font-weight="800">${score}</text><text x="60" y="560" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="24">aibenchmarkindex.com</text><rect x="660" y="100" width="490" height="430" rx="28" fill="white"/>${drawing}</svg>`;
}
