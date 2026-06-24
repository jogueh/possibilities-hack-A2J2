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

const GENERIC_ROLE_TOKENS = new Set([
  "manager",
  "engineer",
  "analyst",
  "specialist",
  "coordinator",
  "associate",
  "lead",
  "senior",
  "junior",
  "representative",
  "rep",
  "i",
  "ii",
  "iii",
]);

function roleTokens(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function rolesOverlap(candidate: string, target: string): boolean {
  const candidateTokens = new Set(roleTokens(candidate));
  const targetTokens = roleTokens(target);
  const specificTargetTokens = targetTokens.filter(
    (t) => !GENERIC_ROLE_TOKENS.has(t),
  );

  if (specificTargetTokens.length > 0) {
    return specificTargetTokens.some((t) => candidateTokens.has(t));
  }

  return targetTokens.some((t) => candidateTokens.has(t));
}

// ---------------------------------------------------------------------------
// Array-aware accessors. The LLM emits the plural fields; we fall back to the
// singular ones for backwards-compat with older callers and the keyword
// fallback. `targetValues` returns a deduped, lowercased set used by the
// per-field matchers below.
// ---------------------------------------------------------------------------

function targetRoles(goal: ParsedGoal): string[] {
  return goal.targetRoles && goal.targetRoles.length > 0
    ? goal.targetRoles
    : goal.targetRole
    ? [goal.targetRole]
    : [];
}

function targetIndustries(goal: ParsedGoal): string[] {
  return goal.targetIndustries && goal.targetIndustries.length > 0
    ? goal.targetIndustries
    : goal.targetIndustry
    ? [goal.targetIndustry]
    : [];
}

function targetLocations(goal: ParsedGoal): string[] {
  return goal.targetLocations && goal.targetLocations.length > 0
    ? goal.targetLocations
    : goal.targetLocation
    ? [goal.targetLocation]
    : [];
}

const US_STATE_ALIASES = new Map([
  ["al", "al"],
  ["alabama", "al"],
  ["ak", "ak"],
  ["alaska", "ak"],
  ["az", "az"],
  ["arizona", "az"],
  ["ar", "ar"],
  ["arkansas", "ar"],
  ["ca", "ca"],
  ["california", "ca"],
  ["co", "co"],
  ["colorado", "co"],
  ["ct", "ct"],
  ["connecticut", "ct"],
  ["de", "de"],
  ["delaware", "de"],
  ["fl", "fl"],
  ["florida", "fl"],
  ["ga", "ga"],
  ["georgia", "ga"],
  ["hi", "hi"],
  ["hawaii", "hi"],
  ["id", "id"],
  ["idaho", "id"],
  ["il", "il"],
  ["illinois", "il"],
  ["in", "in"],
  ["indiana", "in"],
  ["ia", "ia"],
  ["iowa", "ia"],
  ["ks", "ks"],
  ["kansas", "ks"],
  ["ky", "ky"],
  ["kentucky", "ky"],
  ["la", "la"],
  ["louisiana", "la"],
  ["me", "me"],
  ["maine", "me"],
  ["md", "md"],
  ["maryland", "md"],
  ["ma", "ma"],
  ["massachusetts", "ma"],
  ["mi", "mi"],
  ["michigan", "mi"],
  ["mn", "mn"],
  ["minnesota", "mn"],
  ["ms", "ms"],
  ["mississippi", "ms"],
  ["mo", "mo"],
  ["missouri", "mo"],
  ["mt", "mt"],
  ["montana", "mt"],
  ["ne", "ne"],
  ["nebraska", "ne"],
  ["nv", "nv"],
  ["nevada", "nv"],
  ["nh", "nh"],
  ["nj", "nj"],
  ["nm", "nm"],
  ["ny", "ny"],
  ["oh", "oh"],
  ["ohio", "oh"],
  ["ok", "ok"],
  ["oklahoma", "ok"],
  ["or", "or"],
  ["oregon", "or"],
  ["pa", "pa"],
  ["pennsylvania", "pa"],
  ["ri", "ri"],
  ["sc", "sc"],
  ["sd", "sd"],
  ["tn", "tn"],
  ["tennessee", "tn"],
  ["tx", "tx"],
  ["texas", "tx"],
  ["ut", "ut"],
  ["utah", "ut"],
  ["vt", "vt"],
  ["vermont", "vt"],
  ["va", "va"],
  ["virginia", "va"],
  ["wa", "wa"],
  ["wi", "wi"],
  ["wisconsin", "wi"],
  ["wy", "wy"],
  ["wyoming", "wy"],
]);

function locationParts(location: string): string[] {
  return normalize(location)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function locationTokenSet(location: string): Set<string> {
  return new Set(locationParts(location).filter((t) => !US_STATE_ALIASES.has(t)));
}

function stateTokenSet(location: string): Set<string> {
  return new Set(
    locationParts(location)
      .map((t) => US_STATE_ALIASES.get(t))
      .filter((t): t is string => Boolean(t)),
  );
}

function locationOverlaps(candidate: string, target: string): boolean {
  const candidateTokens = locationTokenSet(candidate);
  const targetTokens = locationTokenSet(target);

  if (targetTokens.size > 0) {
    return [...targetTokens].every((t) => candidateTokens.has(t));
  }

  const candidateStates = stateTokenSet(candidate);
  return [...stateTokenSet(target)].some((t) => candidateStates.has(t));
}

// ---------------------------------------------------------------------------
// Per-signal matchers — true when ANY of the target values matches.
// ---------------------------------------------------------------------------

export function matchesRole(text: string, goal: ParsedGoal): boolean {
  return targetRoles(goal).some((role) => rolesOverlap(text, role));
}

export function matchesIndustry(industry: string, goal: ParsedGoal): boolean {
  return targetIndustries(goal).some((ind) => keywordOverlap(industry, ind));
}

export function matchesLocation(location: string, goal: ParsedGoal): boolean {
  const locations = targetLocations(goal);
  if (locations.length === 0) return false;
  return locations.some((loc) => locationOverlaps(location, loc));
}

// Excludes — used to penalise off-target candidates instead of (or in addition
// to) the per-signal bonuses. Soft exclusion: an excluded match deducts the
// matching signal's weight from the final score rather than disqualifying
// the candidate outright, so a great role + skill match can still surface
// even with a wrong-coast location (downranked, not hidden).

function excludedByRole(text: string, goal: ParsedGoal): boolean {
  return (goal.excludeRoles ?? []).some((r) => keywordOverlap(text, r));
}

function excludedByIndustry(industry: string, goal: ParsedGoal): boolean {
  return (goal.excludeIndustries ?? []).some((i) => keywordOverlap(industry, i));
}

function excludedByLocation(location: string, goal: ParsedGoal): boolean {
  return (goal.excludeLocations ?? []).some((loc) =>
    locationOverlaps(location, loc),
  );
}

// ---------------------------------------------------------------------------
// Weights (defaults sum to 100 for the user scorer). Per-query overrides come
// in via `parsedGoal.weightOverrides`; unspecified weights fall back to these.
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  role: 35,
  industry: 20,
  location: 20,
  skills: 15,
  activity: 10,
} as const;

const ROLE_MISMATCH_MAX_SCORE = 39;

/**
 * Structural shape of the scoring weights. `typeof WEIGHTS` would be a tuple
 * of literal-number types (`{ role: 35; ... }`) because of `as const`, which
 * blocks override values like 50. Use this looser type when callers need to
 * combine the literal defaults with user-supplied overrides.
 */
export type Weights = {
  role: number;
  industry: number;
  location: number;
  skills: number;
  activity: number;
};

function effectiveWeights(goal: ParsedGoal): Weights {
  const o = goal.weightOverrides;
  if (!o) return WEIGHTS;
  return {
    role: o.role ?? WEIGHTS.role,
    industry: o.industry ?? WEIGHTS.industry,
    location: o.location ?? WEIGHTS.location,
    skills: o.skills ?? WEIGHTS.skills,
    activity: o.activity ?? WEIGHTS.activity,
  };
}

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
  const target = [
    ...targetRoles(goal),
    ...targetIndustries(goal),
    ...(goal.concepts ?? []),
    goal.intent,
  ]
    .filter(Boolean)
    .join(" ");
  return skills.some((skill) => keywordOverlap(target, skill));
}

/**
 * Score a user against a parsed goal, 0–100.
 * Signals: role/position (across their resolved job history), industry,
 * location, skills overlap, and posting activity. Per-query weight overrides
 * on `parsedGoal.weightOverrides` rebalance any of these. Exclusion lists on
 * the goal subtract the matching signal's weight when the user trips them
 * (soft downrank — a great match elsewhere can still surface).
 */
export function scoreUserAgainstGoal(
  user: UserWithJobs,
  parsedGoal: ParsedGoal,
): number {
  const w = effectiveWeights(parsedGoal);
  let score = 0;
  const hasTargetRole = targetRoles(parsedGoal).length > 0;
  const roleMatched = user.job_history.some((j) =>
    matchesRole(j.position, parsedGoal),
  );

  if (roleMatched) {
    score += w.role;
  }
  if (user.job_history.some((j) => matchesIndustry(j.industry, parsedGoal))) {
    score += w.industry;
  }
  if (matchesLocation(user.current_location, parsedGoal)) {
    score += w.location;
  }
  if (skillsOverlap(user.skills, parsedGoal)) {
    score += w.skills;
  }

  const activity = deriveActivityStatus(user);
  if (activity === "active") score += w.activity;
  else if (activity === "moderate") score += w.activity / 2;

  // Soft exclusions: a candidate who trips an exclusion loses the matching
  // signal's weight. Applied AFTER the bonuses so the deduction is meaningful.
  if (user.job_history.some((j) => excludedByRole(j.position, parsedGoal))) {
    score -= w.role;
  }
  if (
    user.job_history.some((j) => excludedByIndustry(j.industry, parsedGoal))
  ) {
    score -= w.industry;
  }
  if (excludedByLocation(user.current_location, parsedGoal)) {
    score -= w.location;
  }

  const finalScore = clamp(score);
  return hasTargetRole && w.role > 0 && !roleMatched
    ? Math.min(finalScore, ROLE_MISMATCH_MAX_SCORE)
    : finalScore;
}

// ---------------------------------------------------------------------------
// Job scoring (consumed by W4 job discovery)
// ---------------------------------------------------------------------------

/**
 * Score a job against a parsed goal, 0–100.
 * Jobs have no skills/activity, so only the position/industry/location signals
 * apply; they are re-weighted to sum to 100 so job scores stay comparable to
 * user scores on the same 0–100 / alignmentTier scale. Per-query weight
 * overrides and exclusion lists are honoured the same way as for user scoring.
 */
export function scoreJobAgainstGoal(job: Job, goal: ParsedGoal): number {
  const w = effectiveWeights(goal);
  const total = w.role + w.industry + w.location;
  // If the override zeroes out every signal a job can match on, no job can
  // ever score above 0 — avoid divide-by-zero and return 0 instead.
  if (total <= 0) return 0;
  const scale = 100 / total;

  let score = 0;
  const hasTargetRole = targetRoles(goal).length > 0;
  const roleMatched = matchesRole(job.position, goal);
  if (roleMatched) score += w.role;
  if (matchesIndustry(job.industry, goal)) score += w.industry;
  if (matchesLocation(job.location, goal)) score += w.location;

  // Soft exclusions — same idea as for users.
  if (excludedByRole(job.position, goal)) score -= w.role;
  if (excludedByIndustry(job.industry, goal)) score -= w.industry;
  if (excludedByLocation(job.location, goal)) score -= w.location;

  const finalScore = clamp(score * scale);
  return hasTargetRole && w.role > 0 && !roleMatched
    ? Math.min(finalScore, ROLE_MISMATCH_MAX_SCORE)
    : finalScore;
}
