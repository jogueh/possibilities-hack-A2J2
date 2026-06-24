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

/**
 * "Generic" role tokens that on their own are weak signals: they appear in
 * dozens of distinct roles ("DevOps Engineer", "Sales Engineer", "Mechanical
 * Engineer"…) so a haystack containing just "engineer" should NOT earn the
 * full role weight against a target like "Software Engineer". Distinctive
 * tokens ("software", "devops", "marketing", "machine") carry the real signal.
 *
 * Used by `phraseStrength` to weight matched tokens — generic-only matches
 * earn a tiny fraction of the weight, full distinctive matches earn 1.0.
 */
const GENERIC_ROLE_TOKENS = new Set<string>([
  // role suffixes / common nouns
  "engineer",
  "engineering",
  "engineers",
  "developer",
  "developers",
  "development",
  "manager",
  "management",
  "specialist",
  "analyst",
  "consultant",
  "coordinator",
  "associate",
  "assistant",
  "professional",
  "officer",
  "representative",
  // seniority qualifiers
  "senior",
  "junior",
  "lead",
  "principal",
  "staff",
  "head",
  "chief",
  "director",
  "intern",
  "trainee",
  "entry",
  "mid",
  "level",
  // structural words that survive the 3-char filter
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "jobs",
  "job",
  "role",
  "roles",
]);

/**
 * Weight assigned to a generic token when matched. 0.15 means matching only
 * "engineer" earns 15% of full credit, while matching "software" earns 100%.
 * Combined with `MIN_POSSIBLE_WEIGHT` below this means a 1-token target whose
 * only token is generic ("Engineer" alone) can never score above 15%.
 */
const GENERIC_TOKEN_WEIGHT = 0.15;

/**
 * Minimum value of the denominator in `phraseStrength`. Without this, a
 * target made entirely of generic tokens (e.g. "Engineer") would score 1.0
 * any time it matched, defeating the down-weighting. Pinning the denominator
 * at 1.0 keeps generic-only targets bounded at `GENERIC_TOKEN_WEIGHT`.
 */
const MIN_POSSIBLE_WEIGHT = 1.0;

function tokenWeight(token: string): number {
  return GENERIC_ROLE_TOKENS.has(token) ? GENERIC_TOKEN_WEIGHT : 1.0;
}

/**
 * Computes how strongly `phrase`'s tokens are present in `haystack`,
 * weighted by token signal. Returns a value in [0, 1]:
 *   - 1.0 when every distinctive token in `phrase` appears in `haystack`
 *   - low (~0.13) when only generic tokens like "engineer" match
 *   - 0 when nothing matches
 *
 * This is the core fix for the boolean substring matcher: previously
 * "DevOps Engineer" and "Software Engineer" both scored the same full
 * role weight because "engineer" alone was enough. Now the haystack must
 * also share the distinctive token ("software", "devops"…) to earn it.
 */
export function phraseStrength(haystack: string, phrase: string): number {
  const phraseTokens = tokens(phrase);
  if (phraseTokens.length === 0) return 0;
  const hay = normalize(haystack);
  let earned = 0;
  let possible = 0;
  for (const t of phraseTokens) {
    const w = tokenWeight(t);
    possible += w;
    if (hay.includes(t)) earned += w;
  }
  return earned / Math.max(possible, MIN_POSSIBLE_WEIGHT);
}

/** Maximum `phraseStrength` of `haystack` against any of the candidate phrases. */
export function bestPhraseStrength(
  haystack: string,
  phrases: string[],
): number {
  let best = 0;
  for (const p of phrases) {
    const s = phraseStrength(haystack, p);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Threshold above which a phrase-strength counts as a "match" in the boolean
 * back-compat helpers (`matchesRole`, `matchesIndustry`). 0.4 sits comfortably
 * above the generic-only floor (~0.13) so a haystack must share at least one
 * distinctive token, while still admitting partial multi-token matches like
 * "Software Architect" vs "Software Engineer" (strength ≈ 0.87).
 */
const MATCH_STRENGTH_THRESHOLD = 0.4;

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

/**
 * Tokenize a location string into a set; a match exists if ANY token overlaps.
 * Used by both the target and the exclude paths so "Bay Area" / "San Francisco"
 * / "Mountain View, CA" all interact predictably through the shared token
 * vocabulary (san, francisco, ca, ...).
 */
function locationTokenSet(location: string): Set<string> {
  return new Set(
    normalize(location)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function locationOverlaps(candidate: string, target: string): boolean {
  const candidateTokens = locationTokenSet(candidate);
  return [...locationTokenSet(target)].some((t) => candidateTokens.has(t));
}

// ---------------------------------------------------------------------------
// Per-signal strength matchers — return 0–1 indicating how well the candidate
// matches ANY of the target values. The boolean `matchesX` wrappers below are
// kept for the existing call sites (jobMatches filtering, fixtures, tests).
// ---------------------------------------------------------------------------

export function roleMatchStrength(text: string, goal: ParsedGoal): number {
  return bestPhraseStrength(text, targetRoles(goal));
}

export function industryMatchStrength(
  industry: string,
  goal: ParsedGoal,
): number {
  return bestPhraseStrength(industry, targetIndustries(goal));
}

export function matchesRole(text: string, goal: ParsedGoal): boolean {
  return roleMatchStrength(text, goal) >= MATCH_STRENGTH_THRESHOLD;
}

export function matchesIndustry(industry: string, goal: ParsedGoal): boolean {
  return industryMatchStrength(industry, goal) >= MATCH_STRENGTH_THRESHOLD;
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
//
// Excludes use FULL-PHRASE substring match (not phrase-strength) because they
// are intentional, user-supplied signals where every word is meant to count:
//   - excludeRoles: ["Manager"] should fire on every role containing "manager"
//   - excludeRoles: ["Software Engineer"] should fire ONLY on roles literally
//     containing "software engineer" (not on "DevOps Engineer" via shared
//     "engineer" — that would be the same false-positive trap we just fixed
//     for the role bonus, in reverse).

function phraseAppearsIn(haystack: string, phrase: string): boolean {
  const needle = normalize(phrase);
  if (needle.length === 0) return false;
  return normalize(haystack).includes(needle);
}

function excludedByRole(text: string, goal: ParsedGoal): boolean {
  return (goal.excludeRoles ?? []).some((r) => phraseAppearsIn(text, r));
}

function excludedByIndustry(industry: string, goal: ParsedGoal): boolean {
  return (goal.excludeIndustries ?? []).some((i) =>
    phraseAppearsIn(industry, i),
  );
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

/**
 * Bidirectional skill ↔ target strength: a skill counts as aligned if it
 * either appears in a target phrase ("Software Engineering" → "Software
 * Engineer" target) or contains a target phrase ("Python" skill against an
 * intent that mentions Python). Returns max over every (skill, phrase) pair.
 *
 * Bidirectional matching matters because skills are usually 1–2 tokens but
 * target phrases vary in length: a 1-token skill against a 3-token target
 * needs the target→skill direction to surface, and a 3-token skill against
 * a 1-token target needs the skill→target direction.
 */
function skillsStrength(skills: string[], goal: ParsedGoal): number {
  if (skills.length === 0) return 0;
  const phrases = [
    ...targetRoles(goal),
    ...targetIndustries(goal),
    ...(goal.concepts ?? []),
    goal.intent ?? "",
  ].filter((p) => p && p.trim().length > 0);
  if (phrases.length === 0) return 0;
  let best = 0;
  for (const skill of skills) {
    for (const phrase of phrases) {
      const s = Math.max(
        phraseStrength(phrase, skill),
        phraseStrength(skill, phrase),
      );
      if (s > best) best = s;
    }
  }
  return best;
}

/** Best `phraseStrength` of any `text` against any of the goal's target phrases. */
function bestStrengthAcross(
  texts: string[],
  pick: (g: ParsedGoal) => string[],
  goal: ParsedGoal,
): number {
  const phrases = pick(goal);
  if (phrases.length === 0 || texts.length === 0) return 0;
  let best = 0;
  for (const t of texts) {
    const s = bestPhraseStrength(t, phrases);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Score a user against a parsed goal, 0–100.
 * Signals: role/position (across their resolved job history), industry,
 * location, skills overlap, and posting activity. Per-query weight overrides
 * on `parsedGoal.weightOverrides` rebalance any of these. Exclusion lists on
 * the goal subtract the matching signal's weight when the user trips them
 * (soft downrank — a great match elsewhere can still surface).
 *
 * Each signal contributes `weight × strength` rather than an all-or-nothing
 * bonus, so a haystack that matches only on a generic token like "engineer"
 * earns roughly 15% of the role weight instead of the full amount. This is
 * what stops a "DevOps Engineer" from showing up as a strong-aligned match
 * for a "Software Engineer" goal.
 */
export function scoreUserAgainstGoal(
  user: UserWithJobs,
  parsedGoal: ParsedGoal,
): number {
  const w = effectiveWeights(parsedGoal);
  let score = 0;

  const positions = user.job_history.map((j) => j.position);
  const industries = user.job_history.map((j) => j.industry);

  score += w.role * bestStrengthAcross(positions, targetRoles, parsedGoal);
  score +=
    w.industry * bestStrengthAcross(industries, targetIndustries, parsedGoal);
  if (matchesLocation(user.current_location, parsedGoal)) {
    score += w.location;
  }
  score += w.skills * skillsStrength(user.skills, parsedGoal);

  const activity = deriveActivityStatus(user);
  if (activity === "active") score += w.activity;
  else if (activity === "moderate") score += w.activity / 2;

  // Soft exclusions: a candidate who trips an exclusion loses the matching
  // signal's weight. Applied AFTER the bonuses so the deduction is meaningful.
  if (positions.some((p) => excludedByRole(p, parsedGoal))) {
    score -= w.role;
  }
  if (industries.some((i) => excludedByIndustry(i, parsedGoal))) {
    score -= w.industry;
  }
  if (excludedByLocation(user.current_location, parsedGoal)) {
    score -= w.location;
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
 * user scores on the same 0–100 / alignmentTier scale. Per-query weight
 * overrides and exclusion lists are honoured the same way as for user scoring.
 * Each signal contributes `weight × strength` (see `scoreUserAgainstGoal`).
 */
export function scoreJobAgainstGoal(job: Job, goal: ParsedGoal): number {
  const w = effectiveWeights(goal);
  const total = w.role + w.industry + w.location;
  // If the override zeroes out every signal a job can match on, no job can
  // ever score above 0 — avoid divide-by-zero and return 0 instead.
  if (total <= 0) return 0;
  const scale = 100 / total;

  let score = 0;
  score += w.role * roleMatchStrength(job.position, goal);
  score += w.industry * industryMatchStrength(job.industry, goal);
  if (matchesLocation(job.location, goal)) score += w.location;

  // Soft exclusions — same idea as for users.
  if (excludedByRole(job.position, goal)) score -= w.role;
  if (excludedByIndustry(job.industry, goal)) score -= w.industry;
  if (excludedByLocation(job.location, goal)) score -= w.location;

  return clamp(score * scale);
}
