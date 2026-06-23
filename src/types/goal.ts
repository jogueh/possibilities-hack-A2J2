// ParsedGoal is produced by `parseGoal` (see src/lib/goalParser.ts) and consumed
// by the scoring functions (W4) and the `/api/web/generate` endpoint (W2).

export interface ParsedGoal {
  targetRole?: string
  targetIndustry?: string
  targetLocation?: string
  /** The original raw user input, retained for downstream context. */
  intent: string
}
