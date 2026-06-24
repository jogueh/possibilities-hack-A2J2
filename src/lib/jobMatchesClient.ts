// Client-side wrapper around the real `POST /api/jobs/matches` route.
// Returns the ranked `JobMatch[]` for the given goal + web membership.
import type { JobMatch } from "@/types/job";

export async function fetchJobMatches(
  rawGoal: string,
  webUserIds: string[],
): Promise<JobMatch[]> {
  const res = await fetch("/api/jobs/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal: rawGoal, userIds: webUserIds }),
  });
  if (!res.ok) throw new Error(`Failed to fetch job matches: ${res.status}`);
  const data = (await res.json()) as { matches: JobMatch[] };
  return data.matches;
}
