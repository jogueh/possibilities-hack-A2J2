import { describe, it, expect } from "vitest";
import {
  ACTIVITY_RING_COLORS,
  ACTIVITY_RING_LABELS,
  activityRing,
  activityRingColor,
  activityRingLabel,
} from "./activityRing";
import { deriveActivityStatus, type ActivityStatus } from "./scoring";
import type { User } from "@/types/data";

const ALL_STATUSES = Object.keys(ACTIVITY_RING_COLORS) as ActivityStatus[];

function userWithPosts(count: number): User {
  return {
    id: "u",
    name: "Test User",
    school_history: [],
    job_history: [],
    current_location: "San Francisco, CA",
    posts_activity: Array.from({ length: count }, (_, i) => `post ${i}`),
    skills: [],
    courses: [],
    connections: [],
  };
}

describe("activityRing presentation mapping", () => {
  it("maps each status to its scoped colour", () => {
    expect(activityRingColor("active")).toBe("#3B82F6");
    expect(activityRingColor("moderate")).toBe("#F59E0B");
    expect(activityRingColor("inactive")).toBe("#EF4444");
  });

  it("maps each status to an actionable outreach label", () => {
    expect(activityRingLabel("active")).toBe("Great time to reach out");
    expect(activityRingLabel("moderate")).toBe("Worth a nudge");
    expect(activityRingLabel("inactive")).toBe("Lead with shared context");
  });

  it("returns a combined payload from activityRing()", () => {
    expect(activityRing("moderate")).toEqual({
      status: "moderate",
      color: "#F59E0B",
      label: "Worth a nudge",
    });
  });

  it("defines a colour and label for every ActivityStatus (exhaustive)", () => {
    for (const status of ALL_STATUSES) {
      expect(ACTIVITY_RING_COLORS[status]).toMatch(/^#[0-9A-F]{6}$/);
      expect(ACTIVITY_RING_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("uses a distinct colour and label per status", () => {
    const colors = ALL_STATUSES.map(activityRingColor);
    const labels = ALL_STATUSES.map(activityRingLabel);
    expect(new Set(colors).size).toBe(ALL_STATUSES.length);
    expect(new Set(labels).size).toBe(ALL_STATUSES.length);
  });

  it("composes with deriveActivityStatus end-to-end", () => {
    // 3+ posts → active, 1–2 → moderate, 0 → inactive (see scoring.ts).
    expect(activityRing(deriveActivityStatus(userWithPosts(5))).color).toBe(
      "#3B82F6",
    );
    expect(activityRing(deriveActivityStatus(userWithPosts(1))).color).toBe(
      "#F59E0B",
    );
    expect(activityRing(deriveActivityStatus(userWithPosts(0))).color).toBe(
      "#EF4444",
    );
  });
});
