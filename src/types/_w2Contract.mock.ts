// MOCK of the W2 ParsedGoal contract (from src/lib/goalParser.ts).
// TODO(W2): delete this file and import the real ParsedGoal once W2 publishes it.
// Mirrors plan/features/workflow-2-ai-data-layer/scope.md.

export interface ParsedGoal {
  targetRole?: string;
  targetIndustry?: string;
  targetLocation?: string;
  intent: string;
}
