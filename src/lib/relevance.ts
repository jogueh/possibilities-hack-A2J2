// W3-OWNED. Goal-relevant experience filter for the node sidebar. See plan.md
import type { Job, ParsedGoal } from "@/mocks/data";

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function tokens(s: string | undefined): string[] {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function overlaps(value: string, target: string | undefined): boolean {
  const t = norm(target);
  if (!t) return false;
  const v = norm(value);
  if (!v) return false;
  if (v.includes(t) || t.includes(v)) return true;
  const targetTokens = new Set(tokens(target));
  return tokens(value).some((tok) => targetTokens.has(tok));
}

/**
 * Returns jobs whose `position` or `industry` overlaps with the parsed goal's
 * `targetRole` / `targetIndustry`. Falls back to the first 2 jobs (assuming the
 * input is already sorted most-recent-first) when nothing overlaps. NEVER exposes
 * salary data — callers receive jobs with salary values redacted.
 */
export function filterRelevantJobs(jobs: Job[], parsedGoal: ParsedGoal): Job[] {
  const matched = jobs.filter(
    (job) =>
      overlaps(job.position, parsedGoal.targetRole) ||
      overlaps(job.industry, parsedGoal.targetIndustry),
  );

  const selected = matched.length > 0 ? matched : jobs.slice(0, 2);

  // Salary must never appear downstream — strip it defensively at the boundary.
  return selected.map((job) => ({
    ...job,
    salary_range: { from: "", to: "" },
  }));
}
