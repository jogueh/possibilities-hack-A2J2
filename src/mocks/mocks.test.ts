// Sanity tests for W3 mock scaffolding (Step 0). Ensures mock shapes & store API are intact.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ALIGNMENT_COLORS, alignmentColor } from "@/mocks/alignmentColors";
import { fetchUserWithJobs, MOCK_USERS } from "@/mocks/userApi";
import { useWebStore, __resetMockWebState } from "@/mocks/useWebStore";
import type { WebNode } from "@/types/web";

const node2: WebNode = {
  id: "n2",
  userId: "user_1001",
  label: "Alice",
  degree: 2,
  avatarInitials: "AN",
  alignmentTier: "strong",
  interactionScore: 0,
  relevanceScore: 80,
  position: { x: 0, y: 0 },
};

describe("W3 foundation mocks", () => {
  beforeEach(() => __resetMockWebState());

  it("exposes alignment ring colors for every tier", () => {
    expect(alignmentColor("strong")).toBe(ALIGNMENT_COLORS.strong);
    expect(Object.keys(ALIGNMENT_COLORS)).toEqual(["strong", "moderate", "weak"]);
  });

  it("fetchUserWithJobs resolves a known user and returns null for unknown", async () => {
    const u = await fetchUserWithJobs("user_4579");
    expect(u?.name).toBe("Bob Smith");
    expect(u?.job_history[0].company).toBe(MOCK_USERS.user_4579.job_history[0].company);
    expect(await fetchUserWithJobs("nope")).toBeNull();
  });

  it("mock store addSecondDegreeNode appends and is idempotent on duplicate id", () => {
    const { result } = renderHook(() =>
      useWebStore((s) => ({ nodes: s.nodes, add: s.addSecondDegreeNode })),
    );
    expect(result.current.nodes).toHaveLength(0);
    act(() => result.current.add(node2, "n1"));
    expect(result.current.nodes).toHaveLength(1);
    act(() => result.current.add(node2, "n1"));
    expect(result.current.nodes).toHaveLength(1); // idempotent
  });
});
