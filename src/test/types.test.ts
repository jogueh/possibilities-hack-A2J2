import { describe, it, expect } from "vitest";
import {
  jobInnovatech,
  jobMatchInnovatech,
  userBob,
  webNodeBob,
} from "@/test/fixtures";

// Step 1 establishes the W4 type contract. These tests lock the fixture shapes
// so later steps (scoring, overlap, API) build on a stable, validated foundation.

describe("W4 job types & fixtures", () => {
  it("Job fixture has all required fields", () => {
    expect(jobInnovatech.id).toMatch(/^job_/);
    expect(jobInnovatech.company).toBeTruthy();
    expect(jobInnovatech.position).toBeTruthy();
    expect(typeof jobInnovatech.easy_apply).toBe("boolean");
    expect(jobInnovatech.salary_range).toHaveProperty("from");
  });

  it("JobMatch links a job, a 0-100 score, and web connections", () => {
    expect(jobMatchInnovatech.job.id).toBe(jobInnovatech.id);
    expect(jobMatchInnovatech.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(jobMatchInnovatech.relevanceScore).toBeLessThanOrEqual(100);
    expect(jobMatchInnovatech.webConnections.length).toBeGreaterThan(0);
    expect(jobMatchInnovatech.webConnections[0].userId).toBe(userBob.id);
  });

  it("WebConnectionRef uses approximate (~) year ranges when present, never exact dates", () => {
    const years = jobMatchInnovatech.webConnections[0].overlapYears;
    // overlapYears is optional in the contract; only enforce the ~ prefix when present.
    if (years !== undefined) {
      expect(years).toMatch(/^~/);
    }
  });

  it("WebNode mock fixture aligns userId with dataset user", () => {
    expect(webNodeBob.userId).toBe(userBob.id);
    expect(webNodeBob.degree).toBe(1);
  });
});
