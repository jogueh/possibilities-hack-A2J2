import type { Job } from "@/types/data";
import type {
  ParsedGoal,
  UserWithJobs,
  AlignmentTier,
  ActivityStatus,
} from "@/types/scoring";

/**
 * Shared scoring engine.
 *
 * Single source of truth for all goal-based scoring across the app:
 *  - W2 (seed web) imports `scoreUserAgainstGoal`
 *  - W4 (job discovery) uses `scoreJobAgainstGoal`
 *
 * All functions are pure and deterministic — same inputs always produce the
 * same score, with no randomness, I/O, or LLM calls. Goal *parsing* (turning
 * free text into a ParsedGoal) is owned by W2; this module only consumes the
 * already-parsed goal.
 */

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
  return keywordOverlap(location, goal.targetLocation);
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
// Derivations
// ---------------------------------------------------------------------------

export function alignmentTier(score: number): AlignmentTier {
  if (score >= 70) return "strong";
  if (score >= 40) return "moderate";
  return "weak";
}

export function activityStatus(postsActivityCount: number): ActivityStatus {
  if (postsActivityCount >= 3) return "active";
  if (postsActivityCount >= 1) return "moderate";
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
 * Signals: role/position (across their job history), industry, location,
 * skills overlap, and posting activity.
 */
export function scoreUserAgainstGoal(
  user: UserWithJobs,
  goal: ParsedGoal,
): number {
  let score = 0;

  const roleMatch = user.jobs.some((j) => matchesRole(j.position, goal));
  if (roleMatch) score += WEIGHTS.role;

  const industryMatch = user.jobs.some((j) => matchesIndustry(j.industry, goal));
  if (industryMatch) score += WEIGHTS.industry;

  if (matchesLocation(user.current_location, goal)) score += WEIGHTS.location;

  if (skillsOverlap(user.skills, goal)) score += WEIGHTS.skills;

  const activity = activityStatus(user.posts_activity.length);
  if (activity === "active") {
    score += WEIGHTS.activity;
  } else if (activity === "moderate") {
    score += WEIGHTS.activity / 2;
  }

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
