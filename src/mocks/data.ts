// ⚠️ W3 MOCK — replace with W2 real impl at `src/types/data.ts`. See plan.md
// Mirrors the W2 raw dataset shapes EXACTLY (same names) so integration is an import swap.

export interface SchoolHistoryEntry {
  school_name: string;
  degree: string;
  graduation_year: number;
}

export interface User {
  id: string;
  name: string;
  school_history: SchoolHistoryEntry[];
  job_history: string[]; // array of job IDs → resolve via jobs dataset
  current_location: string;
  posts_activity: string[];
  skills: string[];
  courses: string[];
}

export interface Job {
  id: string;
  company: string;
  location: string;
  position: string;
  salary_range: { from: string; to: string }; // ⚠️ must NEVER be rendered or sent to the LLM
  industry: string;
  level: string; // "Entry" | "Mid" | "Senior"
  easy_apply: boolean;
  description: string;
}

// User with resolved job records (W2 `resolveUserWithJobs`).
export interface UserWithJobs extends Omit<User, "job_history"> {
  job_history: Job[];
}

// W2 goal-parser output.
export interface ParsedGoal {
  targetRole?: string;
  targetIndustry?: string;
  targetLocation?: string;
  intent: string;
}
