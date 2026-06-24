// ⚠️ W4 MOCK — replace with W2 real endpoint `GET /api/jobs/matches?goal=&userId=`.
// Mirrors the `JobMatch[]` payload W2's route will return (it runs `buildJobMatches`
// server-side over the same datasets), so the Jobs Panel can be built/tested now.
// At integration, swap `fetchJobMatches` for a real `fetch('/api/jobs/matches?...')`.
import type { Job, UserWithJobs } from "@/types/data";
import type { ParsedGoal } from "@/types/goal";
import type { JobMatch } from "@/types/job";
import { buildJobMatches } from "@/lib/jobMatches";
import { MOCK_USERS } from "@/mocks/userApi";
let jobsCache: Job[] | null = null;

async function getJobs(): Promise<Job[]> {
  if (jobsCache) return jobsCache;
  const { default: jobsData } = await import("@/data/jobs_data.json");
  jobsCache = jobsData as Job[];
  return jobsCache;
}

/**
 * Resolve the web's node user ids to full `UserWithJobs` records and rank the
 * static jobs dataset against the goal. Skips user ids the mock can't resolve.
 */
export async function fetchJobMatches(
  goal: ParsedGoal,
  webUserIds: string[],
): Promise<JobMatch[]> {
  const webUsers: UserWithJobs[] = webUserIds
    .map((id) => MOCK_USERS[id] as UserWithJobs | undefined)
    .filter((u): u is UserWithJobs => Boolean(u));
  const jobs = await getJobs();
  return buildJobMatches(jobs, webUsers, goal);
}
