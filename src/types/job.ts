import type { Job } from "./data";

// A reference to a connection already present in the user's web who has worked
// at a given job's company. Used to render the "N people in your web worked here"
// overlap callout.
export interface WebConnectionRef {
  userId: string;
  name: string;
  role: string; // their role at this company
  overlapYears?: string; // approximate, e.g. "~2021–2023" (no exact dates in dataset)
}

// A single scored job posting cross-referenced against the user's web.
// Easy-apply status is read from job.easy_apply directly.
export interface JobMatch {
  job: Job;
  relevanceScore: number; // 0–100, scored from role/industry/location goal alignment
  webConnections: WebConnectionRef[];
}

// Response shape for POST /api/jobs/matches
export interface JobMatchesResponse {
  matches: JobMatch[];
}
