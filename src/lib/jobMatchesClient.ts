// Client-side jobs-match wrapper. Promoted from src/mocks/jobsApi.ts during the
// mock-to-real migration. Runs `buildJobMatches` over the static jobs dataset
// using the current web's userIds + a parsed goal — no /api/jobs/matches route
// exists, so the JobsPanel calls this directly on the client. (Adding a server
// route is tracked as a separate follow-up; see plan.md.)

import type { Job, UserWithJobs } from "@/types/data";
import type { ParsedGoal } from "@/types/goal";
import type { JobMatch } from "@/types/job";
import { buildJobMatches } from "@/lib/jobMatches";
import { resolveUserWithJobs } from "@/lib/data";

let jobsCache: Job[] | null = null;

async function getJobs(): Promise<Job[]> {
  if (jobsCache) return jobsCache;
  const { default: jobsData } = await import("@/data/jobs_data.json");
  jobsCache = jobsData as Job[];
  return jobsCache;
}

/**
 * Resolve the web's node user ids to full `UserWithJobs` records (via
 * `resolveUserWithJobs` from the real data lib) and rank the static jobs
 * dataset against the parsed goal. User ids that don't resolve are skipped.
 */
export async function fetchJobMatches(
  goal: ParsedGoal,
  webUserIds: string[],
): Promise<JobMatch[]> {
  const resolved = await Promise.all(
    webUserIds.map((id) => resolveUserWithJobs(id)),
  );
  const webUsers: UserWithJobs[] = resolved.filter(
    (u): u is UserWithJobs => u !== null,
  );
  const jobs = await getJobs();
  return buildJobMatches(jobs, webUsers, goal);
}
