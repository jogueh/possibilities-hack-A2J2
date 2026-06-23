import { describe, it, expect } from "vitest";
import type { Job } from "@/types/data";
import type { UserWithJobs, ParsedGoal } from "@/types/scoring";
import { buildJobMatches, MAX_JOB_MATCHES } from "@/lib/jobMatches";
import { jobAcmeSwe, jobInnovatech, userBob, goalSwe } from "@/test/fixtures";

const bobAtInnovatech: UserWithJobs = { ...userBob, jobs: [jobInnovatech] };

function sweJob(id: string, overrides: Partial<Job> = {}): Job {
  return { ...jobAcmeSwe, id, ...overrides };
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
    expect(matches[0].easyApply).toBe(jobAcmeSwe.easy_apply);
  });

  it("populates webConnections when the web overlaps the company", () => {
    const acmeJob = sweJob("job_acme_2", { company: "Innovatech" });
    const [match] = buildJobMatches([acmeJob], [bobAtInnovatech], goalSwe);
    expect(match.webConnections).toEqual([
      { userId: "user_4579", name: "Bob Smith", role: "Marketing Specialist" },
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
