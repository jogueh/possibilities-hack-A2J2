// ⚠️ W3 MOCK — replace with W2 real endpoint `GET /api/user/[userId]`. See plan.md
// Provides the same resolved `UserWithJobs` payload W2 will return, so the W3 sidebar can
// be built/tested now. Swap `fetchUserWithJobs` for a real `fetch('/api/user/'+id)` later.
import type { Job, UserWithJobs } from "@/types/data";

const JOB_A: Job = {
  id: "job_500483",
  company: "Google",
  location: "Boston, MA",
  position: "Software Engineer",
  salary_range: { from: "120000", to: "180000" },
  industry: "Technology",
  level: "Senior",
  easy_apply: true,
  description: "Build large-scale systems.",
};

const JOB_B: Job = {
  id: "job_546688",
  company: "Innovatech",
  location: "Austin, TX",
  position: "Marketing Specialist",
  salary_range: { from: "40463", to: "127219" },
  industry: "Healthcare",
  level: "Mid",
  easy_apply: false,
  description: "Healthcare marketing.",
};

export const MOCK_USERS: Record<string, UserWithJobs> = {
  user_4579: {
    id: "user_4579",
    name: "Bob Smith",
    school_history: [
      { school_name: "University of California, Berkeley", degree: "Psychology", graduation_year: 2019 },
      { school_name: "Stanford University", degree: "Education", graduation_year: 2023 },
    ],
    job_history: [JOB_A, JOB_B],
    current_location: "Boston, MA",
    posts_activity: ["Participated in a hackathon and won first place"],
    skills: ["Education", "Psychology", "Software Engineering"],
    courses: [],
    connections: ["user_1001"],
  },
  user_1001: {
    id: "user_1001",
    name: "Alice Nguyen",
    school_history: [
      { school_name: "University of California, Berkeley", degree: "Computer Science", graduation_year: 2020 },
    ],
    job_history: [JOB_A],
    current_location: "San Francisco, CA",
    posts_activity: ["Shared an article", "Commented on a post", "Posted a job opening"],
    skills: ["Software Engineering", "Python", "Distributed Systems"],
    courses: [],
    connections: ["user_4579"],
  },
};

// Mirrors W2: returns the user or null (→ 404) when not found.
export async function fetchUserWithJobs(userId: string): Promise<UserWithJobs | null> {
  return MOCK_USERS[userId] ?? null;
}
