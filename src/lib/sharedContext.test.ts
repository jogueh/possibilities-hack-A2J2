import { describe, it, expect } from "vitest";
import { getSharedContext } from "@/lib/sharedContext";
import type { Job, UserWithJobs } from "@/mocks/data";

function job(company: string): Job {
  return {
    id: "j_" + company,
    company,
    location: "Boston, MA",
    position: "Engineer",
    salary_range: { from: "", to: "" },
    industry: "Tech",
    level: "Mid",
    easy_apply: false,
    description: "",
  };
}

function user(p: Partial<UserWithJobs> & { id: string }): UserWithJobs {
  return {
    name: "Test",
    school_history: [],
    job_history: [],
    current_location: "Boston, MA",
    posts_activity: [],
    skills: [],
    courses: [],
    ...p,
  };
}

describe("getSharedContext", () => {
  it("detects school overlap", () => {
    const viewer = user({
      id: "v",
      school_history: [{ school_name: "UC Berkeley", degree: "CS", graduation_year: 2019 }],
    });
    const target = user({
      id: "t",
      school_history: [{ school_name: "UC Berkeley", degree: "Math", graduation_year: 2018 }],
    });
    const ctx = getSharedContext(viewer, target);
    expect(ctx).toContainEqual({ type: "school", label: "Both attended UC Berkeley" });
  });

  it("detects company overlap from resolved job history", () => {
    const viewer = user({ id: "v", job_history: [job("Google")] });
    const target = user({ id: "t", job_history: [job("Google"), job("Meta")] });
    expect(getSharedContext(viewer, target)).toContainEqual({
      type: "company",
      label: "Both worked at Google",
    });
  });

  it("detects skill and location overlap", () => {
    const viewer = user({ id: "v", skills: ["Python"], current_location: "San Francisco, CA" });
    const target = user({ id: "t", skills: ["python", "Go"], current_location: "San Francisco, CA" });
    const ctx = getSharedContext(viewer, target);
    expect(ctx.some((c) => c.type === "skill")).toBe(true);
    expect(ctx.some((c) => c.type === "location")).toBe(true);
  });

  it("returns empty array when nothing is shared", () => {
    const viewer = user({ id: "v", skills: ["A"], current_location: "Boston, MA" });
    const target = user({ id: "t", skills: ["B"], current_location: "Austin, TX" });
    expect(getSharedContext(viewer, target)).toEqual([]);
  });

  it("deduplicates repeated overlaps", () => {
    const viewer = user({ id: "v", job_history: [job("Google"), job("Google")] });
    const target = user({ id: "t", job_history: [job("Google")] });
    const companies = getSharedContext(viewer, target).filter((c) => c.type === "company");
    expect(companies).toHaveLength(1);
  });
});
