import { describe, it, expect } from "vitest";
import type { UserWithJobs, ParsedGoal } from "@/types/scoring";
import {
  matchesRole,
  matchesIndustry,
  matchesLocation,
  scoreUserAgainstGoal,
  scoreJobAgainstGoal,
  alignmentTier,
  activityStatus,
  WEIGHTS,
} from "@/lib/scoring";
import { jobAcmeSwe, jobInnovatech, userBob, goalSwe } from "@/test/fixtures";

// Build a UserWithJobs by resolving a user against a set of jobs.
function withJobs(
  user: typeof userBob,
  jobs = [jobInnovatech, jobAcmeSwe],
): UserWithJobs {
  return { ...user, jobs: jobs.filter((j) => user.job_history.includes(j.id)) };
}

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
    expect(matchesLocation("Boston, MA", goalSwe)).toBe(false);
  });

  it("location matcher returns false when goal has no location", () => {
    const goal: ParsedGoal = { intent: "anything" };
    expect(matchesLocation("Mountain View, CA", goal)).toBe(false);
  });
});

describe("alignmentTier thresholds", () => {
  it("maps scores to tiers at 70 and 40 boundaries", () => {
    expect(alignmentTier(70)).toBe("strong");
    expect(alignmentTier(69)).toBe("moderate");
    expect(alignmentTier(40)).toBe("moderate");
    expect(alignmentTier(39)).toBe("weak");
    expect(alignmentTier(0)).toBe("weak");
  });
});

describe("activityStatus derivation", () => {
  it("derives from posts count", () => {
    expect(activityStatus(0)).toBe("inactive");
    expect(activityStatus(1)).toBe("moderate");
    expect(activityStatus(2)).toBe("moderate");
    expect(activityStatus(3)).toBe("active");
    expect(activityStatus(10)).toBe("active");
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
    const inactiveBob = { ...userBob, posts_activity: [] };
    expect(scoreUserAgainstGoal(withJobs(inactiveBob), goal)).toBe(0);
  });

  it("returns 100 when every signal matches", () => {
    const matchedUser = {
      ...userBob,
      job_history: ["job_900001"],
      current_location: "Mountain View, CA",
      posts_activity: ["a", "b", "c"], // active
      skills: ["Software Engineering"],
    };
    expect(scoreUserAgainstGoal(withJobs(matchedUser), goalSwe)).toBe(100);
  });

  it("awards the role weight when a past position matches", () => {
    const user = { ...userBob, job_history: ["job_900001"], posts_activity: [] };
    // role + industry (Acme job is Technology); no location/skills/activity
    const score = scoreUserAgainstGoal(withJobs(user), goalSwe);
    expect(score).toBe(WEIGHTS.role + WEIGHTS.industry);
  });

  it("gives half activity weight for moderate activity", () => {
    const goal: ParsedGoal = { intent: "x", targetLocation: "Boston, MA" };
    // userBob: location Boston matches (20) + 1 post → moderate activity (5)
    const score = scoreUserAgainstGoal(withJobs(userBob), goal);
    expect(score).toBe(WEIGHTS.location + WEIGHTS.activity / 2);
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
