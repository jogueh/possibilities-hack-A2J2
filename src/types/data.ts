// Raw dataset record shapes from https://pit.najera.cc
// Shared dataset types. W2 also consumes these (src/types/data.ts in their scope);
// W4 defines the job-relevant subset here and re-exports as needed.

export interface SchoolHistoryEntry {
  school_name: string;
  degree: string;
  graduation_year: number;
}

export interface DatasetUser {
  id: string;
  name: string;
  school_history: SchoolHistoryEntry[];
  job_history: string[]; // job IDs → resolve via jobs dataset
  current_location: string;
  posts_activity: string[];
  skills: string[];
  courses: string[];
}

export interface SalaryRange {
  from: string;
  to: string;
}

export interface Job {
  id: string;
  company: string;
  location: string;
  position: string;
  salary_range: SalaryRange; // NOTE: never rendered in any UI (see W4 scope)
  industry: string;
  level: string; // "Entry" | "Mid" | "Senior"
  easy_apply: boolean;
  description: string;
}
