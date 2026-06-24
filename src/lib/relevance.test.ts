import { describe, it, expect } from "vitest";
import { filterRelevantJobs } from "@/lib/relevance";
import type { Job } from "@/types/data";
import type { ParsedGoal } from "@/types/goal";

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    company: "Acme",
    location: "Boston, MA",
    position: "Analyst",
    salary_range: { from: "50000", to: "90000" },
    industry: "Finance",
    level: "Mid",
    easy_apply: false,
    description: "",
    ...partial,
  };
}

describe("filterRelevantJobs", () => {
  it("returns only jobs matching targetRole by position", () => {
    const jobs = [
      job({ id: "1", position: "Software Engineer" }),
      job({ id: "2", position: "Marketing Specialist" }),
    ];
    const goal: ParsedGoal = { targetRole: "Software Engineer", intent: "break into SWE" };
    const result = filterRelevantJobs(jobs, goal);
    expect(result.map((j) => j.id)).toEqual(["1"]);
  });

  it("matches on targetIndustry", () => {
    const jobs = [
      job({ id: "1", industry: "Healthcare", position: "Nurse" }),
      job({ id: "2", industry: "Finance", position: "Analyst" }),
    ];
    const goal: ParsedGoal = { targetIndustry: "Healthcare", intent: "x" };
    expect(filterRelevantJobs(jobs, goal).map((j) => j.id)).toEqual(["1"]);
  });

  it("falls back to the 2 most recent jobs when nothing overlaps", () => {
    const jobs = [
      job({ id: "1" }),
      job({ id: "2" }),
      job({ id: "3" }),
    ];
    const goal: ParsedGoal = { targetRole: "Astronaut", intent: "space" };
    const result = filterRelevantJobs(jobs, goal);
    expect(result.map((j) => j.id)).toEqual(["1", "2"]);
  });

  it("never returns real salary data", () => {
    const jobs = [job({ id: "1", position: "Software Engineer" })];
    const goal: ParsedGoal = { targetRole: "Software Engineer", intent: "x" };
    const result = filterRelevantJobs(jobs, goal);
    expect(result[0].salary_range).toEqual({ from: "", to: "" });
    expect(JSON.stringify(result)).not.toContain("50000");
  });
});
