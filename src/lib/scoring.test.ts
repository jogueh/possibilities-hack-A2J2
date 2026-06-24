import { describe, it, expect } from "vitest";
import type { UserWithJobs } from "@/types/data";
import type { ParsedGoal } from "@/types/goal";
import {
  matchesRole,
  matchesIndustry,
  matchesLocation,
  scoreUserAgainstGoal,
  scoreJobAgainstGoal,
  deriveAlignmentTier,
  deriveActivityStatus,
  WEIGHTS,
} from "@/lib/scoring";
import {
  jobAcmeSwe,
  jobInnovatech,
  userBobWithJobs,
  goalSwe,
} from "@/test/fixtures";

describe("signal primitives", () => {
  it("matchesRole is case-insensitive keyword match", () => {
    expect(matchesRole("Senior Software Engineer", goalSwe)).toBe(true);
    expect(matchesRole("Marketing Specialist", goalSwe)).toBe(false);
  });

  it("matchesIndustry tokenizes the goal industry", () => {
    expect(matchesIndustry("Technology", goalSwe)).toBe(true);
    expect(matchesIndustry("Healthcare", goalSwe)).toBe(false);
  });

  it("matchesLocation matches on a shared token", () => {
    expect(matchesLocation("Mountain View, CA", goalSwe)).toBe(true);
    expect(matchesLocation("San Francisco, CA", goalSwe)).toBe(true);
    expect(matchesLocation("Boston, MA", goalSwe)).toBe(false);
  });

  it("location matcher returns false when goal has no location", () => {
    const goal: ParsedGoal = { intent: "anything" };
    expect(matchesLocation("Mountain View, CA", goal)).toBe(false);
  });
});

describe("deriveAlignmentTier thresholds", () => {
  it("maps scores to tiers at 70 and 40 boundaries", () => {
    expect(deriveAlignmentTier(70)).toBe("strong");
    expect(deriveAlignmentTier(69)).toBe("moderate");
    expect(deriveAlignmentTier(40)).toBe("moderate");
    expect(deriveAlignmentTier(39)).toBe("weak");
    expect(deriveAlignmentTier(0)).toBe("weak");
  });
});

describe("deriveActivityStatus derivation", () => {
  it("derives from posts_activity length", () => {
    const base = userBobWithJobs;
    expect(deriveActivityStatus({ ...base, posts_activity: [] })).toBe("inactive");
    expect(deriveActivityStatus({ ...base, posts_activity: ["a"] })).toBe("inactive");
    expect(deriveActivityStatus({ ...base, posts_activity: ["a", "b"] })).toBe("moderate");
    expect(deriveActivityStatus({ ...base, posts_activity: ["a", "b", "c"] })).toBe("active");
  });
});

describe("scoreUserAgainstGoal", () => {
  it("returns 0 when there is no overlap at all", () => {
    const goal: ParsedGoal = {
      targetRole: "astronaut",
      targetIndustry: "aerospace",
      targetLocation: "Houston, TX",
      intent: "become an astronaut",
    };
    const inactive = { ...userBobWithJobs, posts_activity: [] };
    expect(scoreUserAgainstGoal(inactive, goal)).toBe(0);
  });

  it("returns 100 when every signal matches", () => {
    const matched: UserWithJobs = {
      ...userBobWithJobs,
      job_history: [jobAcmeSwe], // SWE / Technology
      current_location: "Mountain View, CA",
      posts_activity: ["a", "b", "c"], // active
      skills: ["Software Engineering"],
    };
    expect(scoreUserAgainstGoal(matched, goalSwe)).toBe(100);
  });

  it("awards role + industry when a past job matches", () => {
    const user: UserWithJobs = {
      ...userBobWithJobs,
      job_history: [jobAcmeSwe],
      posts_activity: [],
    };
    expect(scoreUserAgainstGoal(user, goalSwe)).toBe(
      WEIGHTS.role + WEIGHTS.industry,
    );
  });

  it("gives half activity weight for moderate activity", () => {
    const goal: ParsedGoal = { intent: "x", targetLocation: "Boston, MA" };
    // location Boston (20) + 2 posts -> moderate activity (half of 10 = 5)
    const moderate = { ...userBobWithJobs, posts_activity: ["a", "b"] };
    expect(scoreUserAgainstGoal(moderate, goal)).toBe(
      WEIGHTS.location + WEIGHTS.activity / 2,
    );
  });
});

describe("scoreJobAgainstGoal", () => {
  it("scores a fully-matching job at 100 (re-weighted)", () => {
    expect(scoreJobAgainstGoal(jobAcmeSwe, goalSwe)).toBe(100);
  });

  it("scores a non-matching job at 0", () => {
    expect(scoreJobAgainstGoal(jobInnovatech, goalSwe)).toBe(0);
  });

  it("a partial (role-only) match is between 0 and 100", () => {
    const goal: ParsedGoal = {
      targetRole: "software engineer",
      targetIndustry: "finance",
      targetLocation: "Boston, MA",
      intent: "swe",
    };
    const score = scoreJobAgainstGoal(jobAcmeSwe, goal);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});
