import { describe, it, expect } from "vitest";
import type { Job, UserWithJobs } from "@/types/data";
import type { ParsedGoal } from "@/types/goal";
import { buildJobMatches, MAX_JOB_MATCHES } from "@/lib/jobMatches";
import { jobAcmeSwe, jobInnovatech, userBob, goalSwe } from "@/test/fixtures";

const bobAtInnovatech: UserWithJobs = { ...userBob, job_history: [jobInnovatech] };

function sweJob(id: string, overrides: Partial<Job> = {}): Job {
  return { ...jobAcmeSwe, id, ...overrides };
}

function webUser(id: string, company: string): UserWithJobs {
  return {
    ...userBob,
    id,
    name: `User ${id}`,
    job_history: [sweJob(`${id}_job`, { company })],
  };
}

describe("buildJobMatches", () => {
  it("excludes weak matches (alignmentTier 'weak')", () => {
    // jobInnovatech (Healthcare/Marketing/Austin) scores 0 against an SWE goal.
    const matches = buildJobMatches([jobInnovatech], [bobAtInnovatech], goalSwe);
    expect(matches).toEqual([]);
  });

  it("includes a strong match and attaches its web connections", () => {
    const matches = buildJobMatches(
      [jobAcmeSwe, jobInnovatech],
      [bobAtInnovatech],
      goalSwe,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].job.id).toBe(jobAcmeSwe.id);
    expect(matches[0].relevanceScore).toBe(100);
  });

  it("populates webConnections when the web overlaps the company", () => {
    const acmeJob = sweJob("job_acme_2", { company: "Innovatech" });
    const [match] = buildJobMatches([acmeJob], [bobAtInnovatech], goalSwe);
    expect(match.webConnections).toEqual([
      expect.objectContaining({
        userId: "user_4579",
        name: "Bob Smith",
        role: "Marketing Specialist",
      }),
    ]);
  });

  it("sorts by relevanceScore descending", () => {
    const partialGoal: ParsedGoal = {
      targetRole: "software engineer",
      targetIndustry: "finance",
      targetLocation: "Boston, MA",
      intent: "swe",
    };
    // full match → 100
    const strong = sweJob("strong", {
      industry: "Finance",
      location: "Boston, MA",
    });
    // role only → ~47
    const partial = sweJob("partial", {
      industry: "Technology",
      location: "Austin, TX",
    });
    const matches = buildJobMatches([partial, strong], [], partialGoal);
    expect(matches.map((m) => m.job.id)).toEqual(["strong", "partial"]);
    expect(matches[0].relevanceScore).toBeGreaterThan(matches[1].relevanceScore);
  });

  it("breaks ties by number of web connections", () => {
    const withConn = sweJob("withConn", { company: "Innovatech" });
    const noConn = sweJob("noConn", { company: "Acme" });
    const matches = buildJobMatches(
      [noConn, withConn],
      [bobAtInnovatech],
      goalSwe,
    );
    expect(matches.map((m) => m.job.id)).toEqual(["withConn", "noConn"]);
  });

  it("boosts a lower-relevance job above normal jobs when it has at least two web connections", () => {
    const boostGoal: ParsedGoal = {
      targetRole: "software engineer",
      targetIndustry: "finance",
      targetLocation: "Boston, MA",
      intent: "swe",
      weightOverrides: { role: 60, industry: 30, location: 10 },
    };
    const boosted = sweJob("boosted", {
      company: "BoostCo",
      industry: "Technology",
      location: "Austin, TX",
    });
    const highRelevance = sweJob("highRelevance", {
      company: "SoloCo",
      industry: "Finance",
      location: "Austin, TX",
    });

    const matches = buildJobMatches(
      [highRelevance, boosted],
      [webUser("u1", "BoostCo"), webUser("u2", "BoostCo")],
      boostGoal,
    );

    expect(matches.map((m) => [m.job.id, m.relevanceScore])).toEqual([
      ["boosted", 60],
      ["highRelevance", 90],
    ]);
  });

  it("does not boost a job with exactly one web connection above a higher-relevance normal job", () => {
    const boostGoal: ParsedGoal = {
      targetRole: "software engineer",
      targetIndustry: "finance",
      targetLocation: "Boston, MA",
      intent: "swe",
      weightOverrides: { role: 60, industry: 30, location: 10 },
    };
    const oneConnection = sweJob("oneConnection", {
      company: "OneCo",
      industry: "Technology",
      location: "Austin, TX",
    });
    const highRelevance = sweJob("highRelevance", {
      company: "NoConnCo",
      industry: "Finance",
      location: "Austin, TX",
    });

    const matches = buildJobMatches(
      [oneConnection, highRelevance],
      [webUser("u1", "OneCo")],
      boostGoal,
    );

    expect(matches.map((m) => [m.job.id, m.relevanceScore, m.webConnections.length])).toEqual([
      ["highRelevance", 90, 0],
      ["oneConnection", 60, 1],
    ]);
  });

  it("sorts boosted jobs by relevance first, then web connection count", () => {
    const boostGoal: ParsedGoal = {
      targetRole: "software engineer",
      targetIndustry: "finance",
      targetLocation: "Boston, MA",
      intent: "swe",
      weightOverrides: { role: 50, industry: 30, location: 20 },
    };
    const higherRelevance = sweJob("higherRelevance", {
      company: "HigherCo",
      industry: "Finance",
      location: "Austin, TX",
    });
    const fewerConnections = sweJob("fewerConnections", {
      company: "FewerCo",
      industry: "Technology",
      location: "Austin, TX",
    });
    const moreConnections = sweJob("moreConnections", {
      company: "MoreCo",
      industry: "Technology",
      location: "Austin, TX",
    });
    const users = [
      webUser("h1", "HigherCo"),
      webUser("h2", "HigherCo"),
      webUser("f1", "FewerCo"),
      webUser("f2", "FewerCo"),
      webUser("m1", "MoreCo"),
      webUser("m2", "MoreCo"),
      webUser("m3", "MoreCo"),
    ];

    const matches = buildJobMatches(
      [moreConnections, fewerConnections, higherRelevance],
      users,
      boostGoal,
    );

    expect(matches.map((m) => [m.job.id, m.relevanceScore, m.webConnections.length])).toEqual([
      ["higherRelevance", 80, 2],
      ["moreConnections", 50, 3],
      ["fewerConnections", 50, 2],
    ]);
  });

  it("caps results at the limit", () => {
    const jobs = Array.from({ length: 25 }, (_, i) => sweJob(`job_${i}`));
    const matches = buildJobMatches(jobs, [], goalSwe);
    expect(matches).toHaveLength(MAX_JOB_MATCHES);
  });

  it("respects an explicit limit override", () => {
    const jobs = Array.from({ length: 5 }, (_, i) => sweJob(`job_${i}`));
    expect(buildJobMatches(jobs, [], goalSwe, 3)).toHaveLength(3);
  });

  it("returns [] for an empty jobs dataset", () => {
    expect(buildJobMatches([], [bobAtInnovatech], goalSwe)).toEqual([]);
  });
});
