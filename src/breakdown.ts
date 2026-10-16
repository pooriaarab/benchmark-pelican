import type { Benchmark, RunReport, Task, Trace } from "benchmark-core";

interface CheckRow { name: string; weight: number; passed: boolean; }
export interface CheckSummaryEntry { check: string; passRate: number; meanContribution: number; }
export type PelicanReport = RunReport & { checkSummary: CheckSummaryEntry[] };

function checkRows(details: unknown): CheckRow[] | undefined {
  if (details === null || typeof details !== "object" || Array.isArray(details)) return undefined;
  const checks = Reflect.get(details, "checks");
  if (!Array.isArray(checks)) return undefined;
  return checks as CheckRow[];
}

// benchmark-core's RunReport drops TaskScore.details, so this package re-scores
// each saved submission (deterministic and local) to recover the per-check rows.
export async function attachBreakdown<T extends Task>(report: RunReport, benchmark: Benchmark<T>): Promise<PelicanReport> {
  const byId = new Map((await benchmark.listTasks()).map((task) => [task.id, task]));
  const buckets = new Map<string, { pass: number; earned: number; total: number; count: number }>();
  for (const row of report.rows) {
    const task = byId.get(row.taskId);
    if (!task || !row.submission) continue;
    const grade = await benchmark.score(task, row.submission as Trace);
    const checks = checkRows(grade.details);
    if (!checks) continue;
    (row as { details?: CheckRow[] }).details = checks;
    for (const check of checks) {
      const bucket = buckets.get(check.name) ?? { pass: 0, earned: 0, total: 0, count: 0 };
      bucket.pass += check.passed ? 1 : 0; bucket.earned += check.passed ? check.weight : 0; bucket.total += check.weight; bucket.count += 1;
      buckets.set(check.name, bucket);
    }
  }
  const checkSummary = [...buckets.entries()]
    .map(([check, bucket]) => ({ check, passRate: Math.round((bucket.pass / bucket.count) * 1000) / 1000, meanContribution: Math.round((bucket.earned / bucket.total) * 1000) / 1000 }))
    .sort((a, b) => a.passRate - b.passRate || a.check.localeCompare(b.check));
  return { ...report, checkSummary };
}

export function breakdownText(report: PelicanReport): string {
  if (!report.checkSummary.length) return "";
  const lines = ["", "| Check | Pass rate |", "| --- | ---: |"];
  for (const entry of report.checkSummary) lines.push(`| ${entry.check} | ${(entry.passRate * 100).toFixed(1)}% |`);
  return lines.join("\n");
}
