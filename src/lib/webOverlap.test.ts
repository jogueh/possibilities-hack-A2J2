import { describe, it, expect } from "vitest";
import type { UserWithJobs } from "@/types/data";
import {
  findWebOverlap,
  roleAtCompany,
  overlappingUserIds,
  overlappingNodeIds,
  mostRecentGraduationYear,
  isRecentlyInField,
} from "@/lib/webOverlap";
import { jobInnovatech, jobAcmeSwe, userBobWithJobs } from "@/test/fixtures";
import type { JobMatch } from "@/types/job";
import type { WebNode } from "@/types/web";

// userBobWithJobs.job_history includes job_550126 (Innovatech / Marketing Specialist).
// Bob's most recent graduation_year is 2023 (Stanford).
const bobWithJobs: UserWithJobs = userBobWithJobs;
const bobNoJobs: UserWithJobs = { ...userBobWithJobs, job_history: [] };
const bobOldGrad: UserWithJobs = {
  ...userBobWithJobs,
  school_history: [
    { school_name: "Old State", degree: "History", graduation_year: 2005 },
  ],
};

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
    const refs = findWebOverlap(jobInnovatech, [bobWithJobs], 2025);
    expect(refs).toEqual([
      {
        userId: "user_4579",
        name: "Bob Smith",
        role: "Marketing Specialist",
        recentlyInField: true,
      },
    ]);
  });

  it("flags recentlyInField false when the most recent grad is > 3 years ago", () => {
    const [ref] = findWebOverlap(jobInnovatech, [bobOldGrad], 2025);
    expect(ref.recentlyInField).toBe(false);
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

describe("overlappingNodeIds", () => {
  // A node references a member via `userId`; the decoration map is keyed by the
  // node's own `id`, which differs from the userId on purpose.
  function node(id: string, userId: string): WebNode {
    return {
      id,
      userId,
      label: userId,
      degree: 1,
      avatarInitials: "??",
      alignmentTier: "moderate",
      interactionScore: 0,
      relevanceScore: 50,
      position: { x: 0, y: 0 },
    };
  }

  function match(userIds: string[]): JobMatch {
    return {
      job: jobInnovatech,
      relevanceScore: 80,
      webConnections: userIds.map((userId) => ({
        userId,
        name: userId,
        role: "Engineer",
      })),
    };
  }

  const nodes = [
    node("n1", "user_a"),
    node("n2", "user_b"),
    node("n3", "user_c"),
  ];

  it("returns node ids (not user ids) for members present in any match", () => {
    const ids = overlappingNodeIds([match(["user_a"]), match(["user_c"])], nodes);
    expect(ids).toEqual(new Set(["n1", "n3"]));
  });

  it("dedupes a member that overlaps across multiple matches", () => {
    const ids = overlappingNodeIds([match(["user_a"]), match(["user_a"])], nodes);
    expect(ids).toEqual(new Set(["n1"]));
  });

  it("ignores overlap members that are not in the web", () => {
    const ids = overlappingNodeIds([match(["user_x"])], nodes);
    expect(ids.size).toBe(0);
  });

  it("returns an empty set when there are no matches", () => {
    expect(overlappingNodeIds([], nodes).size).toBe(0);
  });

  it("returns an empty set when matches have no web connections", () => {
    expect(overlappingNodeIds([match([])], nodes).size).toBe(0);
  });
});

describe("mostRecentGraduationYear", () => {
  it("returns the latest graduation year across schools", () => {
    // Bob: UC Berkeley 2019, Stanford 2023 → 2023.
    expect(mostRecentGraduationYear(bobWithJobs)).toBe(2023);
  });

  it("returns undefined when there is no school history", () => {
    const noSchool: UserWithJobs = { ...bobWithJobs, school_history: [] };
    expect(mostRecentGraduationYear(noSchool)).toBeUndefined();
  });
});

describe("isRecentlyInField", () => {
  it("is true when the most recent grad is within 3 years", () => {
    expect(isRecentlyInField(bobWithJobs, 2025)).toBe(true); // 2025 - 2023 = 2
  });

  it("is true exactly at the 3-year boundary", () => {
    expect(isRecentlyInField(bobWithJobs, 2026)).toBe(true); // 2026 - 2023 = 3
  });

  it("is false when the most recent grad is more than 3 years ago", () => {
    expect(isRecentlyInField(bobWithJobs, 2027)).toBe(false); // 2027 - 2023 = 4
  });

  it("is false for a future graduation year (still a student)", () => {
    expect(isRecentlyInField(bobWithJobs, 2022)).toBe(false); // 2022 - 2023 = -1
  });

  it("is false when there is no school history", () => {
    const noSchool: UserWithJobs = { ...bobWithJobs, school_history: [] };
    expect(isRecentlyInField(noSchool, 2025)).toBe(false);
  });
});
