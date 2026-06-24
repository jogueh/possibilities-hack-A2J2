// ParsedGoal is produced by `parseGoal` (see src/lib/goalParser.ts) and consumed
// by the scoring functions (W4) and the `/api/web/generate` endpoint (W2).
//
// The array fields are the canonical surface. The single-string fields
// (`targetRole`, `targetIndustry`, `targetLocation`) are kept as deprecated
// aliases so consumers that haven't migrated still work — `parseGoal` populates
// both, and the scorer normalizes them into the arrays. When the array is
// populated AND the single field is too, the array wins.

/** Soft priority on an extracted filter. */
export type Priority = 'must' | 'should'

/**
 * Structural shape of the scoring weight knob. Defined here (not as
 * `Partial<typeof WEIGHTS>`) to keep the goal type free of an import cycle
 * with @/lib/scoring AND to avoid the literal-number constraint that `as const`
 * imposes on the source. Values are unconstrained `number`; the scorer clamps.
 */
export interface WeightOverrides {
  role?: number
  industry?: number
  location?: number
  skills?: number
  activity?: number
}

export interface ParsedGoal {
  /**
   * Roles the user wants. Plural and array-valued so the LLM can expand
   * adjacent / synonymous roles ("ML" → ["Machine Learning Engineer",
   * "Data Scientist"]).
   */
  targetRoles?: string[]
  /** Industries the user wants. Same plural / expansion idea as `targetRoles`. */
  targetIndustries?: string[]
  /**
   * Concrete locations the user wants. Critical: the LLM should EXPAND
   * regional concepts here. "west coast" → ["San Francisco, CA",
   * "Seattle, WA", "Portland, OR", "Los Angeles, CA", "San Diego, CA"].
   */
  targetLocations?: string[]
  /** Roles to filter out (e.g. "looking for IC, not management" → ["Manager"]). */
  excludeRoles?: string[]
  /** Industries to filter out. */
  excludeIndustries?: string[]
  /**
   * Locations to filter out. Lets the LLM model implicit exclusions:
   * "west coast jobs" → exclude ["New York, NY", "Boston, MA", "Chicago, IL"].
   * Excluded matches subtract the location-weight from the score, so an
   * east-coast person can no longer slip in via skills + activity alone.
   */
  excludeLocations?: string[]
  /**
   * Free-form concept tags ("remote-friendly", "startup", "senior",
   * "open-source") that don't fit the structured slots above. Bonus points
   * when a candidate's profile text overlaps.
   */
  concepts?: string[]
  /**
   * Per-query weight overrides for the scorer. Lets the LLM rebalance signals
   * based on what the user actually emphasized:
   *  - "find people in SF" → {location: 50, role: 20}
   *  - "find ML engineers"  → {role: 50, location: 10}
   * Unspecified weights fall back to the defaults in `@/lib/scoring`. Total
   * does not have to sum to 100; the scorer clamps the final score to [0, 100].
   */
  weightOverrides?: WeightOverrides

  // -------------------------------------------------------------------------
  // Deprecated single-value aliases (kept for backwards compatibility).
  // -------------------------------------------------------------------------
  /** @deprecated Use `targetRoles` instead. Read by the scorer when arrays are empty. */
  targetRole?: string
  /** @deprecated Use `targetIndustries` instead. */
  targetIndustry?: string
  /** @deprecated Use `targetLocations` instead. */
  targetLocation?: string

  /** The original raw user input, retained for downstream context. */
  intent: string
}
