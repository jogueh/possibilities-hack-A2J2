import type { Job } from "@/types/data";
import type { UserWithJobs } from "@/types/data";
import type { WebConnectionRef, JobMatch } from "@/types/job";
import type { WebNode } from "@/types/web";

/**
 * Web-overlap engine (pure functions).
 *
 * Cross-references a job posting against the users currently in the web to find
 * connections who have worked at that job's company — the "N people in your web
 * worked here" differentiator. No I/O, no LLM, fully deterministic.
 *
 * NOTE: the dataset has no per-job dates, so `overlapYears` cannot be known
 * exactly. It is left undefined here (it remains optional on WebConnectionRef);
 * approximate career-timeline labels are derived separately in the timeline step.
 */

function sameCompany(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** "Recently in your field" window: graduated within this many years. */
export const RECENTLY_IN_FIELD_YEARS = 3;

/**
 * Most recent (latest) graduation year across a user's school history, or
 * undefined if they have no schools on record.
 */
export function mostRecentGraduationYear(
  user: UserWithJobs,
): number | undefined {
  let latest: number | undefined;
  for (const s of user.school_history ?? []) {
    if (typeof s.graduation_year !== "number") continue;
    if (latest === undefined || s.graduation_year > latest) {
      latest = s.graduation_year;
    }
  }
  return latest;
}

/**
 * True when the user's most recent graduation was within the last
 * `RECENTLY_IN_FIELD_YEARS` years (and not in the future) — i.e. they have
 * fresh, relevant context.
 *
 * "Recent" is deliberately relative to the present, so `currentYear` defaults
 * to the system clock (`new Date().getFullYear()`); called without it, the
 * result is therefore time-dependent (by design — the badge must track "now").
 * Inject `currentYear` to pin the reference point for deterministic tests.
 */
export function isRecentlyInField(
  user: UserWithJobs,
  currentYear: number = new Date().getFullYear(),
): boolean {
  const gradYear = mostRecentGraduationYear(user);
  if (gradYear === undefined) return false;
  const diff = currentYear - gradYear;
  return diff >= 0 && diff <= RECENTLY_IN_FIELD_YEARS;
}

/**
 * For a single user, return the role they held at `company`, or undefined if
 * they never worked there. Uses the first matching job in their history.
 */
export function roleAtCompany(
  user: UserWithJobs,
  company: string,
): string | undefined {
  if (!company.trim()) return undefined;
  const match = user.job_history.find((j) => sameCompany(j.company, company));
  return match?.position;
}

/**
 * Given a job and the users currently in the web, return refs for every user
 * whose job history includes the job's company.
 *
 * - Returns [] when no web user overlaps.
 * - Safely skips users with no job history.
 * - Excludes the job's company match against an empty/blank company name.
 */
export function findWebOverlap(
  job: Job,
  webUsers: UserWithJobs[],
  currentYear: number = new Date().getFullYear(),
): WebConnectionRef[] {
  if (!job.company.trim()) return [];

  const refs: WebConnectionRef[] = [];
  for (const user of webUsers) {
    const role = roleAtCompany(user, job.company);
    if (!role) continue;
    refs.push({
      userId: user.id,
      name: user.name,
      role,
      recentlyInField: isRecentlyInField(user, currentYear),
    });
  }
  return refs;
}

/**
 * Convenience: the set of user IDs that have at least one web overlap across
 * the provided job matches. Used by the canvas to flag which web nodes get the
 * pulsing "job overlap" ring.
 */
export function overlappingUserIds(
  jobs: Job[],
  webUsers: UserWithJobs[],
): Set<string> {
  const ids = new Set<string>();
  for (const job of jobs) {
    for (const ref of findWebOverlap(job, webUsers)) {
      ids.add(ref.userId);
    }
  }
  return ids;
}

/**
 * Step 6 (canvas overlap highlight): given the goal's job matches and the nodes
 * currently in the web, return the set of `WebNode.id`s that should get the
 * pulsing "job overlap" ring — i.e. nodes whose member appears as a web-overlap
 * connection on at least one matched job.
 *
 * Keyed by node id (what the canvas decoration map needs) but driven by the
 * member's userId. Reuses the `webConnections` already attached to each
 * JobMatch, so it needs no extra data resolution. Pure and deterministic.
 */
export function overlappingNodeIds(
  matches: JobMatch[],
  nodes: WebNode[],
): Set<string> {
  const overlapUserIds = new Set<string>();
  for (const match of matches) {
    for (const ref of match.webConnections) {
      overlapUserIds.add(ref.userId);
    }
  }

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (overlapUserIds.has(node.userId)) {
      nodeIds.add(node.id);
    }
  }
  return nodeIds;
}
