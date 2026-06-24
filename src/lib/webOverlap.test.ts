import { describe, it, expect } from "vitest";
import type { UserWithJobs } from "@/types/data";
import {
  findWebOverlap,
  roleAtCompany,
  overlappingUserIds,
  overlappingNodeIds,
} from "@/lib/webOverlap";
import { jobInnovatech, jobAcmeSwe, userBobWithJobs } from "@/test/fixtures";
import type { JobMatch } from "@/types/job";
import type { WebNode } from "@/types/web";

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
