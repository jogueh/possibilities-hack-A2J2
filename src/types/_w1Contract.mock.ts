// MOCK of the W1 shared contract (src/types/web.ts).
// TODO(W1): delete this file and import from "@/types/web" once W1 publishes it.
// Mirrors the contract documented in plan/features/workflow-1-graph-canvas/scope.md.

export type AlignmentTier = "strong" | "moderate" | "weak";
export type WebState = "empty" | "seeded" | "expanded";
export type DegreeLevel = 1 | 2;

export interface WebNode {
  id: string;
  userId: string;
  label: string;
  degree: DegreeLevel;
  avatarInitials: string;
  alignmentTier: AlignmentTier;
  interactionScore: number;
  relevanceScore: number;
  position: { x: number; y: number };
}

export interface WebEdge {
  id: string;
  source: string;
  target: string;
  strength: number;
  isDotted: boolean;
}

export interface GoalQuery {
  raw: string;
  userId: string;
}
