// =============================================================================
// Shared scoring engine — owned by Workflow 4.
// =============================================================================
// Replaces the former MOCK in this file with the real weighted scorer. Signatures
// are kept identical to the mock so W2's API layer (POST /api/web/generate) and
// any other consumer keep working unchanged:
//   - scoreUserAgainstGoal(user, parsedGoal) -> 0–100
//   - deriveAlignmentTier(score) -> AlignmentTier
//   - deriveActivityStatus(user) -> ActivityStatus
//
// All functions are pure and deterministic — no randomness, I/O, or LLM calls.
// Goal *parsing* (free text -> ParsedGoal) is owned by W2; this module only
// consumes the already-parsed goal.
// =============================================================================

import type { ParsedGoal } from "@/types/goal";
import type { User, UserWithJobs, Job } from "@/types/data";
import type { AlignmentTier } from "@/types/web";

export type ActivityStatus = "active" | "moderate" | "inactive";

// ---------------------------------------------------------------------------
// Low-level signal primitives (case-insensitive keyword/substring matching)
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/** Split a phrase into meaningful keyword tokens (drops short filler words). */
function tokens(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/** True if any keyword of `needle` appears in `haystack` (case-insensitive). */
function keywordOverlap(haystack: string, needle?: string): boolean {
  if (!needle) return false;
  const hay = normalize(haystack);
  return tokens(needle).some((t) => hay.includes(t));
}

export function matchesRole(text: string, goal: ParsedGoal): boolean {
  return keywordOverlap(text, goal.targetRole);
}

export function matchesIndustry(industry: string, goal: ParsedGoal): boolean {
  return keywordOverlap(industry, goal.targetIndustry);
}

export function matchesLocation(location: string, goal: ParsedGoal): boolean {
  if (!goal.targetLocation) return false;
  // Match on city OR state token so "Mountain View, CA" matches "CA".
  const locationTokens = new Set(
    normalize(location)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
  return normalize(goal.targetLocation)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .some((t) => locationTokens.has(t));
}

// ---------------------------------------------------------------------------
// Weights (sum to 100 for the user scorer)
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  role: 35,
  industry: 20,
  location: 20,
  skills: 15,
  activity: 10,
} as const;

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Derivations (signatures match the former mock)
// ---------------------------------------------------------------------------

export function deriveAlignmentTier(score: number): AlignmentTier {
  if (score >= 70) return "strong";
  if (score >= 40) return "moderate";
  return "weak";
}

export function deriveActivityStatus(user: User | UserWithJobs): ActivityStatus {
  // Posting cadence drives the activity ring: 3+ posts = active (blue),
  // exactly 2 = moderate (amber), 0–1 = inactive (red, lead with shared context).
  const n = user.posts_activity?.length ?? 0;
  if (n >= 3) return "active";
  if (n >= 2) return "moderate";
  return "inactive";
}

// ---------------------------------------------------------------------------
// User scoring (consumed by W2 to seed the web)
// ---------------------------------------------------------------------------

function skillsOverlap(skills: string[], goal: ParsedGoal): boolean {
  const target = `${goal.targetRole ?? ""} ${goal.targetIndustry ?? ""} ${goal.intent}`;
  return skills.some((skill) => keywordOverlap(target, skill));
}

/**
 * Score a user against a parsed goal, 0–100.
 * Signals: role/position (across their resolved job history), industry,
 * location, skills overlap, and posting activity.
 */
export function scoreUserAgainstGoal(
  user: UserWithJobs,
  parsedGoal: ParsedGoal,
): number {
  let score = 0;

  if (user.job_history.some((j) => matchesRole(j.position, parsedGoal))) {
    score += WEIGHTS.role;
  }
  if (user.job_history.some((j) => matchesIndustry(j.industry, parsedGoal))) {
    score += WEIGHTS.industry;
  }
  if (matchesLocation(user.current_location, parsedGoal)) {
    score += WEIGHTS.location;
  }
  if (skillsOverlap(user.skills, parsedGoal)) {
    score += WEIGHTS.skills;
  }

  const activity = deriveActivityStatus(user);
  if (activity === "active") score += WEIGHTS.activity;
  else if (activity === "moderate") score += WEIGHTS.activity / 2;

  return clamp(score);
}

// ---------------------------------------------------------------------------
// Job scoring (consumed by W4 job discovery)
// ---------------------------------------------------------------------------

/**
 * Score a job against a parsed goal, 0–100.
 * Jobs have no skills/activity, so only the position/industry/location signals
 * apply; they are re-weighted to sum to 100 so job scores stay comparable to
 * user scores on the same 0–100 / alignmentTier scale.
 */
export function scoreJobAgainstGoal(job: Job, goal: ParsedGoal): number {
  const total = WEIGHTS.role + WEIGHTS.industry + WEIGHTS.location; // 75
  const scale = 100 / total;

  let score = 0;
  if (matchesRole(job.position, goal)) score += WEIGHTS.role;
  if (matchesIndustry(job.industry, goal)) score += WEIGHTS.industry;
  if (matchesLocation(job.location, goal)) score += WEIGHTS.location;

  return clamp(score * scale);
}
