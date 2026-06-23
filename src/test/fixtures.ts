import type { User, Job } from "@/types/data";
import type { JobMatch } from "@/types/job";
import type { WebNode } from "@/types/_w1Contract.mock";
import type { ParsedGoal } from "@/types/_w2Contract.mock";

// Shared fixtures used across W4 unit tests (steps 1–8).

export const jobInnovatech: Job = {
  id: "job_550126",
  company: "Innovatech",
  location: "Austin, TX",
  position: "Marketing Specialist",
  salary_range: { from: "40463", to: "127219" },
  industry: "Healthcare",
  level: "Mid",
  easy_apply: true,
  description: "Looking for a Marketing Specialist with a passion for Healthcare.",
};

export const jobAcmeSwe: Job = {
  id: "job_900001",
  company: "Acme",
  location: "Mountain View, CA",
  position: "Software Engineer",
  salary_range: { from: "120000", to: "180000" },
  industry: "Technology",
  level: "Entry",
  easy_apply: false,
  description: "Build delightful products as a Software Engineer.",
};

export const userBob: User = {
  id: "user_4579",
  name: "Bob Smith",
  school_history: [
    { school_name: "UC Berkeley", degree: "Psychology", graduation_year: 2019 },
    { school_name: "Stanford University", degree: "Education", graduation_year: 2023 },
  ],
  job_history: ["job_550126"],
  current_location: "Boston, MA",
  posts_activity: ["Won a hackathon"],
  skills: ["Education", "Psychology"],
  courses: [],
};

export const goalSwe: ParsedGoal = {
  targetRole: "software engineer",
  targetIndustry: "technology",
  targetLocation: "Mountain View, CA",
  intent: "grow network of software engineers in Mountain View",
};

export const webNodeBob: WebNode = {
  id: "n1",
  userId: "user_4579",
  label: "Bob Smith",
  degree: 1,
  avatarInitials: "BS",
  alignmentTier: "strong",
  interactionScore: 0,
  relevanceScore: 82,
  position: { x: 0, y: 0 },
};

export const jobMatchInnovatech: JobMatch = {
  job: jobInnovatech,
  relevanceScore: 71,
  webConnections: [
    { userId: "user_4579", name: "Bob Smith", role: "Marketing Specialist", overlapYears: "~2021–2023" },
  ],
  easyApply: true,
};
