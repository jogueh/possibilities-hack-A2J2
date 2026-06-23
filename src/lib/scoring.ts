// =============================================================================
// MOCK — owned by Workflow 4, swap on merge.
// =============================================================================
// W4 owns the pure scoring functions (see plan/features/workflow-4-job-discovery
// and plan/features/workflow-2-ai-data-layer). This file is a clearly-labeled
// placeholder so W2's API layer (notably POST /api/web/generate) is runnable
// end-to-end while W4's real implementation is in flight.
//
// Behavior here is deterministic but intentionally simplistic — it is NOT a
// substitute for the real weighted scorer. W4's module will replace this file
// wholesale; signatures must stay byte-for-byte identical.
//
// Note: W2/W4 scope uses a 0–100 score scale (tier thresholds 70 / 40). W1's
// snapshot module currently uses a 0–1 scale internally for layout defaults;
// the two will be reconciled when W4 lands. W2 emits 0–100 on the wire per
// the W2 scope.
// =============================================================================

import type { ParsedGoal } from '@/types/goal'
import type { User, UserWithJobs } from '@/types/data'

export type AlignmentTier = 'strong' | 'moderate' | 'weak'
export type ActivityStatus = 'active' | 'moderate' | 'inactive'

/**
 * MOCK: returns a deterministic 0–100 pseudo-score derived from byte sums of
 * the user id and parsed goal fields. Enough variance to differentiate users
 * so `/api/web/generate` can rank/filter, but NOT a real relevance signal.
 */
export function scoreUserAgainstGoal(
  user: UserWithJobs,
  parsedGoal: ParsedGoal,
): number {
  const seed =
    hashString(user.id) +
    hashString(parsedGoal.targetRole ?? '') +
    hashString(parsedGoal.targetIndustry ?? '') +
    hashString(parsedGoal.targetLocation ?? '')
  return seed % 101
}

export function deriveAlignmentTier(score: number): AlignmentTier {
  if (score >= 70) return 'strong'
  if (score >= 40) return 'moderate'
  return 'weak'
}

export function deriveActivityStatus(user: User | UserWithJobs): ActivityStatus {
  const n = user.posts_activity?.length ?? 0
  if (n >= 3) return 'active'
  if (n >= 1) return 'moderate'
  return 'inactive'
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}
