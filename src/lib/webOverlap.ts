import type { Job } from "@/types/data";
import type { UserWithJobs } from "@/types/data";
import type { WebConnectionRef } from "@/types/job";

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

/**
 * For a single user, return the role they held at `company`, or undefined if
 * they never worked there. Uses the first matching job in their history.
 */
export function roleAtCompany(
  user: UserWithJobs,
  company: string,
): string | undefined {
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
): WebConnectionRef[] {
  if (!job.company.trim()) return [];

  const refs: WebConnectionRef[] = [];
  for (const user of webUsers) {
    const role = roleAtCompany(user, job.company);
    if (!role) continue;
    refs.push({ userId: user.id, name: user.name, role });
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
