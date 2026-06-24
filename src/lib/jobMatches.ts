import type { Job, UserWithJobs } from "@/types/data";
import type { ParsedGoal } from "@/types/goal";
import type { JobMatch } from "@/types/job";
import { scoreJobAgainstGoal, deriveAlignmentTier } from "@/lib/scoring";
import { findWebOverlap } from "@/lib/webOverlap";

/**
 * Job-matching composition (pure functions).
 *
 * Turns the static jobs dataset + the current web's users + a parsed goal into
 * a ranked list of `JobMatch`. No I/O, no LLM — the thin API route handler
 * (owned by W2) only needs to load the datasets and call `buildJobMatches`.
 */

/** Max job cards surfaced for the MVP (scope: "take top 10"). */
export const MAX_JOB_MATCHES = 10;

/** Web-connection count that floats a job into the boosted tier. */
export const JOB_BOOST_MIN_CONNECTIONS = 2;

/**
 * Score every job against the goal, attach web-overlap connections, drop weak
 * matches, float jobs with enough web connections into a boosted tier, sort each
 * tier by relevance (web overlap breaks ties), and cap at the top N.
 */
export function buildJobMatches(
  jobs: Job[],
  webUsers: UserWithJobs[],
  goal: ParsedGoal,
  limit: number = MAX_JOB_MATCHES,
): JobMatch[] {
  const scored: JobMatch[] = [];

  for (const job of jobs) {
    const relevanceScore = scoreJobAgainstGoal(job, goal);
    // Exclude weak matches — never pad the list with irrelevant jobs.
    if (deriveAlignmentTier(relevanceScore) === "weak") continue;

    scored.push({
      job,
      relevanceScore,
      webConnections: findWebOverlap(job, webUsers),
    });
  }

  scored.sort((a, b) => {
    const aBoosted = a.webConnections.length >= JOB_BOOST_MIN_CONNECTIONS;
    const bBoosted = b.webConnections.length >= JOB_BOOST_MIN_CONNECTIONS;
    if (aBoosted !== bBoosted) return aBoosted ? -1 : 1;
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    // Tie-break: surface jobs where you have a warm connection first.
    return b.webConnections.length - a.webConnections.length;
  });

  return scored.slice(0, Math.min(MAX_JOB_MATCHES, Math.max(0, limit)));
}
