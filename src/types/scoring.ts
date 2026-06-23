import type { DatasetUser, Job } from "./data";

// Scoring input/output contract. Owned by the scoring engine (src/lib/scoring.ts).
// W2's goal parser PRODUCES a ParsedGoal (LLM/keyword extraction); the scoring
// engine CONSUMES it. W2 owns parseGoal; W4 owns everything that scores against it.

export interface ParsedGoal {
  targetRole?: string;
  targetIndustry?: string;
  targetLocation?: string;
  intent: string;
}

// A dataset user with their job_history IDs resolved to full Job records.
export interface UserWithJobs extends DatasetUser {
  jobs: Job[];
}

export type AlignmentTier = "strong" | "moderate" | "weak";
export type ActivityStatus = "active" | "moderate" | "inactive";
