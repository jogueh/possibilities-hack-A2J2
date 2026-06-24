import type { UserWithJobs } from "@/types/data";

// Real client-side data access for a single member profile. Calls the
// `GET /api/user/[userId]` endpoint, which resolves the member from the local
// `src/data/user_data.json` dataset (via `src/lib/data.ts`) and returns a fully
// resolved `UserWithJobs`. This replaces the labelled mock at
// `src/mocks/userApi.ts`; it preserves that mock's `fetchUserWithJobs(userId)`
// signature (resolve `null` when the member is not found) so consumers swap with
// a one-line import change.
export async function fetchUserWithJobs(
  userId: string,
): Promise<UserWithJobs | null> {
  const res = await fetch(`/api/user/${encodeURIComponent(userId)}`);
  if (!res.ok) return null;
  return (await res.json()) as UserWithJobs;
}
