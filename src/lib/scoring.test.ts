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

describe("multi-value goal fields", () => {
  it("matchesLocation hits any value in targetLocations (west-coast expansion)", () => {
    const goal: ParsedGoal = {
      intent: "find west coast people",
      targetLocations: [
        "San Francisco, CA",
        "Seattle, WA",
        "Portland, OR",
        "Los Angeles, CA",
      ],
    };
    expect(matchesLocation("Seattle, WA", goal)).toBe(true);
    expect(matchesLocation("Portland, OR", goal)).toBe(true);
    expect(matchesLocation("Mountain View, CA", goal)).toBe(true); // CA token match
    expect(matchesLocation("Boston, MA", goal)).toBe(false);
    expect(matchesLocation("New York, NY", goal)).toBe(false);
  });

  it("matchesRole hits any value in targetRoles", () => {
    const goal: ParsedGoal = {
      intent: "find ML people",
      targetRoles: ["Machine Learning Engineer", "Data Scientist"],
    };
    expect(matchesRole("Senior Machine Learning Engineer", goal)).toBe(true);
    expect(matchesRole("Junior Data Scientist", goal)).toBe(true);
    expect(matchesRole("Marketing Specialist", goal)).toBe(false);
  });

  it("array fields take precedence over the deprecated singular alias", () => {
    // Singular says "Marketing", arrays say "Engineer" — arrays win.
    const goal: ParsedGoal = {
      intent: "x",
      targetRole: "Marketing Specialist",
      targetRoles: ["Software Engineer"],
    };
    expect(matchesRole("Marketing Specialist", goal)).toBe(false);
    expect(matchesRole("Software Engineer", goal)).toBe(true);
  });
});

describe("excludes (soft downrank)", () => {
  it("excludeLocations subtracts the location weight from the score", () => {
    // Build a user who DOES match the location (so the bonus is awarded and
    // there's something for the exclusion to subtract from). The without-
    // exclude version should award `WEIGHTS.location`; adding the exclude
    // should subtract it back, netting 0 contribution from the location
    // signal.
    const targetLocations = ["San Francisco, CA", "Seattle, WA"];
    const without: ParsedGoal = {
      intent: "west coast",
      targetLocations,
    };
    // Same locations on excludeLocations — every candidate location both
    // matches and excludes. The two weights cancel.
    const withExclude: ParsedGoal = {
      ...without,
      excludeLocations: targetLocations,
    };
    const sfBob = { ...userBobWithJobs, current_location: "San Francisco, CA" };
    const before = scoreUserAgainstGoal(sfBob, without);
    const after = scoreUserAgainstGoal(sfBob, withExclude);
    expect(before - after).toBe(WEIGHTS.location);
  });

  it("excludeRoles subtracts the role weight when any job position matches", () => {
    const goal: ParsedGoal = {
      intent: "individual contributor",
      targetRoles: ["Software Engineer"],
      excludeRoles: ["Manager"],
    };
    // Synthesize a user who BOTH matches the target role (so role bonus is
    // applied) AND trips the exclude (so we can see the subtraction). With
    // the strength-based scorer the role bonus needs a real distinctive-token
    // match — "Software Engineering Manager" satisfies both at once.
    const manager = {
      ...userBobWithJobs,
      job_history: [
        {
          ...userBobWithJobs.job_history[0],
          position: "Software Engineering Manager",
        },
      ],
    };
    const baseline = scoreUserAgainstGoal(manager, {
      ...goal,
      excludeRoles: undefined,
    });
    const withExclude = scoreUserAgainstGoal(manager, goal);
    expect(baseline - withExclude).toBe(WEIGHTS.role);
  });
});

describe("phrase-strength role/industry matching", () => {
  // The key regression: a DevOps Engineer must NOT match a "Software
  // Engineer" goal at the strong tier just because both contain the word
  // "engineer". Same idea for "Sales Engineer", "Mechanical Engineer", etc.
  const sweGoal: ParsedGoal = {
    intent: "swe roles",
    targetRoles: ["Software Engineer"],
  };

  it("matchesRole rejects a generic-only collision (DevOps vs Software Engineer)", () => {
    expect(matchesRole("DevOps Engineer", sweGoal)).toBe(false);
    expect(matchesRole("Sales Engineer", sweGoal)).toBe(false);
    expect(matchesRole("Mechanical Engineer", sweGoal)).toBe(false);
  });

  it("matchesRole still accepts a distinctive-token match", () => {
    expect(matchesRole("Senior Software Engineer", sweGoal)).toBe(true);
    expect(matchesRole("Software Architect", sweGoal)).toBe(true);
    expect(matchesRole("Backend Software Developer", sweGoal)).toBe(true);
  });

  it("seniority qualifiers alone are not enough (Senior Manager vs Software Engineer)", () => {
    expect(matchesRole("Senior Manager", sweGoal)).toBe(false);
    expect(matchesRole("Lead Manager", sweGoal)).toBe(false);
  });

  it("a generic-only target (Engineer) caps its own match strength", () => {
    const generic: ParsedGoal = { intent: "engineers", targetRoles: ["Engineer"] };
    // The bonus is capped at GENERIC_TOKEN_WEIGHT (15%) which falls below
    // the 40% match threshold — the LLM is expected to be more specific.
    expect(matchesRole("DevOps Engineer", generic)).toBe(false);
    expect(matchesRole("Software Engineer", generic)).toBe(false);
  });

  it("a DevOps Engineer earns far less of the role weight than a Software Engineer", () => {
    const devops = {
      ...userBobWithJobs,
      job_history: [
        { ...userBobWithJobs.job_history[0], position: "DevOps Engineer" },
      ],
    };
    const swe = {
      ...userBobWithJobs,
      job_history: [
        { ...userBobWithJobs.job_history[0], position: "Software Engineer" },
      ],
    };
    const sweScore = scoreUserAgainstGoal(swe, sweGoal);
    const devopsScore = scoreUserAgainstGoal(devops, sweGoal);
    // The SWE should beat the DevOps Engineer by roughly 85% of the role
    // weight (the distinctive "software" token contributes the missing 0.85).
    expect(sweScore - devopsScore).toBeGreaterThan(WEIGHTS.role * 0.7);
  });

  it("scoreJobAgainstGoal: SWE goal ranks a true SWE job strong and a DevOps job weak", () => {
    // A realistic goal has more than just a role — once industry + location
    // are also targeted, a true SWE job at the right industry/location
    // fills the full signal budget and lands in the strong tier, while a
    // DevOps job at the same place only earns generic-token credit on role
    // and lands in the weak tier.
    const fullGoal: ParsedGoal = {
      intent: "swe roles in tech in SF",
      targetRoles: ["Software Engineer"],
      targetIndustries: ["Technology"],
      targetLocations: ["San Francisco, CA"],
    };
    const sweJob = {
      ...jobAcmeSwe,
      position: "Software Engineer",
      industry: "Technology",
      location: "San Francisco, CA",
    };
    const devopsJob = { ...sweJob, position: "DevOps Engineer" };
    const sweScore = scoreJobAgainstGoal(sweJob, fullGoal);
    const devopsScore = scoreJobAgainstGoal(devopsJob, fullGoal);
    expect(deriveAlignmentTier(sweScore)).toBe("strong");
    // The DevOps job still earns industry + location, but its role
    // contribution is tiny (only "engineer" matches), so it should NOT
    // reach the strong tier from spurious role credit alone.
    expect(deriveAlignmentTier(devopsScore)).not.toBe("strong");
    expect(sweScore).toBeGreaterThan(devopsScore);
  });
});

describe("weightOverrides", () => {
  it("scales the role signal by the override", () => {
    // Use the SWE fixture so the user actually matches the role and the
    // override has something to amplify.
    const sweBob = {
      ...userBobWithJobs,
      job_history: [jobAcmeSwe],
      current_location: "San Francisco, CA",
    };
    const swe: ParsedGoal = {
      intent: "find swe in SF",
      targetRoles: ["Software Engineer"],
      targetLocations: ["San Francisco, CA"],
    };
    const roleHeavy: ParsedGoal = {
      ...swe,
      weightOverrides: { role: 50 },
    };
    const a = scoreUserAgainstGoal(sweBob, swe);
    const b = scoreUserAgainstGoal(sweBob, roleHeavy);
    // Role matches; b should beat a by exactly the delta between the
    // override (50) and the default (35) for role.
    expect(b - a).toBe(50 - WEIGHTS.role);
  });

  it("zeroed-out signals contribute 0 (location override = 0)", () => {
    const goal: ParsedGoal = {
      intent: "location doesn't matter",
      targetLocations: ["San Francisco, CA"],
      weightOverrides: { location: 0 },
    };
    const userInSF = {
      ...userBobWithJobs,
      current_location: "San Francisco, CA",
    };
    const userInBoston = {
      ...userBobWithJobs,
      current_location: "Boston, MA",
    };
    // With location weight 0 both score the same on the location signal.
    expect(scoreUserAgainstGoal(userInSF, goal)).toBe(
      scoreUserAgainstGoal(userInBoston, goal),
    );
  });

  it("scoreJobAgainstGoal returns 0 when all job-relevant weights are 0", () => {
    const goal: ParsedGoal = {
      intent: "x",
      targetRoles: ["Software Engineer"],
      weightOverrides: { role: 0, industry: 0, location: 0 },
    };
    expect(scoreJobAgainstGoal(jobAcmeSwe, goal)).toBe(0);
  });
});
