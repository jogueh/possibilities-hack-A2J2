// ParsedGoal is now owned by the scoring engine's input contract (src/types/scoring.ts).
// Re-exported here so existing Step 1 imports keep working.
// TODO(W2): import ParsedGoal from "@/types/scoring" directly; this shim can be removed.
export type { ParsedGoal } from "./scoring";
