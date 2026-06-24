import { describe, it, expect } from "vitest";
import type { UserWithJobs } from "@/types/data";
import {
  findWebOverlap,
  roleAtCompany,
  overlappingUserIds,
} from "@/lib/webOverlap";
import { jobInnovatech, jobAcmeSwe, userBobWithJobs } from "@/test/fixtures";

// userBobWithJobs.job_history includes job_550126 (Innovatech / Marketing Specialist).
const bobWithJobs: UserWithJobs = userBobWithJobs;
const bobNoJobs: UserWithJobs = { ...userBobWithJobs, job_history: [] };

describe("roleAtCompany", () => {
  it("returns the role when the user worked at the company (case-insensitive)", () => {
    expect(roleAtCompany(bobWithJobs, "innovatech")).toBe("Marketing Specialist");
  });

  it("returns undefined when the user never worked there", () => {
    expect(roleAtCompany(bobWithJobs, "Acme")).toBeUndefined();
  });

  it("returns undefined for a user with no job history", () => {
    expect(roleAtCompany(bobNoJobs, "Innovatech")).toBeUndefined();
  });
});

describe("findWebOverlap", () => {
  it("identifies web users who worked at the job's company", () => {
    const refs = findWebOverlap(jobInnovatech, [bobWithJobs]);
    expect(refs).toEqual([
      { userId: "user_4579", name: "Bob Smith", role: "Marketing Specialist" },
    ]);
  });

  it("returns an empty array when no web user overlaps", () => {
    expect(findWebOverlap(jobAcmeSwe, [bobWithJobs])).toEqual([]);
  });

  it("skips users with no job history", () => {
    expect(findWebOverlap(jobInnovatech, [bobNoJobs])).toEqual([]);
  });

  it("does not populate overlapYears (unknown from dataset)", () => {
    const [ref] = findWebOverlap(jobInnovatech, [bobWithJobs]);
    expect(ref.overlapYears).toBeUndefined();
  });

  it("returns [] for a job with a blank company name", () => {
    const blank = { ...jobInnovatech, company: "  " };
    expect(findWebOverlap(blank, [bobWithJobs])).toEqual([]);
  });
});

describe("overlappingUserIds", () => {
  it("collects unique user ids across multiple jobs", () => {
    const ids = overlappingUserIds([jobInnovatech, jobAcmeSwe], [bobWithJobs]);
    expect(ids).toEqual(new Set(["user_4579"]));
  });

  it("is empty when nothing overlaps", () => {
    const ids = overlappingUserIds([jobAcmeSwe], [bobWithJobs]);
    expect(ids.size).toBe(0);
  });
});
