// W3-OWNED. Goal-relevant experience filter for the node sidebar. See plan.md
import type { Job } from "@/types/data";
import type { ParsedGoal } from "@/types/goal";

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

// Collect every value from the canonical plural field; fall back to the
// singular deprecated alias when the plural is absent so we keep matching
// against the (possibly stale) callers that haven't migrated yet.
function rolesOf(goal: ParsedGoal): string[] {
  return goal.targetRoles && goal.targetRoles.length > 0
    ? goal.targetRoles
    : goal.targetRole
    ? [goal.targetRole]
    : [];
}
function industriesOf(goal: ParsedGoal): string[] {
  return goal.targetIndustries && goal.targetIndustries.length > 0
    ? goal.targetIndustries
    : goal.targetIndustry
    ? [goal.targetIndustry]
    : [];
}

/**
 * Returns jobs whose `position` or `industry` overlaps with ANY of the parsed
 * goal's target roles / industries. Falls back to the first 2 jobs (assuming the
 * input is already sorted most-recent-first) when nothing overlaps. NEVER exposes
 * salary data — callers receive jobs with salary values redacted.
 */
export function filterRelevantJobs(jobs: Job[], parsedGoal: ParsedGoal): Job[] {
  const roles = rolesOf(parsedGoal);
  const industries = industriesOf(parsedGoal);
  const matched = jobs.filter(
    (job) =>
      roles.some((r) => overlaps(job.position, r)) ||
      industries.some((i) => overlaps(job.industry, i)),
  );

  const selected = matched.length > 0 ? matched : jobs.slice(0, 2);

  // Salary must never appear downstream — strip it defensively at the boundary.
  return selected.map((job) => ({
    ...job,
    salary_range: { from: "", to: "" },
  }));
}
