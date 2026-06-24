import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Module mocks MUST be declared before importing the hook under test
// (repo convention — see src/lib/goalParser.test.ts).
const fetchJobMatchesMock = vi.fn();
vi.mock("@/mocks/jobsApi", () => ({
  fetchJobMatches: (...args: unknown[]) => fetchJobMatchesMock(...args),
}));

import { useJobOverlapDecorations } from "./useJobOverlapDecorations";
import { useWebStore } from "@/store/useWebStore";
import type { WebNode } from "@/types/web";
import type { JobMatch } from "@/types/job";
import type { Job } from "@/types/data";

const job = { id: "job_1", company: "Innovatech" } as unknown as Job;

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
    job,
    relevanceScore: 80,
    webConnections: userIds.map((userId) => ({
      userId,
      name: userId,
      role: "Engineer",
    })),
  };
}

const nodes = [node("n1", "user_a"), node("n2", "user_b")];

function seedStore() {
  act(() => {
    useWebStore.getState().setGoal({ raw: "find engineers", userId: "viewer" });
    useWebStore.getState().setParsedGoal({
      intent: "find engineers",
      targetRole: "Software Engineer",
    });
    useWebStore.getState().seedWeb(nodes, []);
  });
}

describe("useJobOverlapDecorations", () => {
  beforeEach(() => {
    fetchJobMatchesMock.mockReset();
    act(() => useWebStore.getState().resetWeb());
  });

  it("maps overlapping members to a hasJobOverlap decoration keyed by node id", async () => {
    fetchJobMatchesMock.mockResolvedValue([match(["user_a"])]);
    seedStore();

    const { result } = renderHook(() => useJobOverlapDecorations());

    await waitFor(() => {
      expect(result.current).toEqual({ n1: { hasJobOverlap: true } });
    });
  });

  it("returns an empty map before matches resolve / when there is no goal", () => {
    fetchJobMatchesMock.mockResolvedValue([match(["user_a"])]);
    const { result } = renderHook(() => useJobOverlapDecorations());
    // No goal seeded → effect never fetches.
    expect(result.current).toEqual({});
  });

  it("yields an empty map when nothing in the web overlaps", async () => {
    fetchJobMatchesMock.mockResolvedValue([match(["user_x"])]);
    seedStore();

    const { result } = renderHook(() => useJobOverlapDecorations());
    await waitFor(() => expect(fetchJobMatchesMock).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });

  it("falls back to an empty map when the fetch rejects", async () => {
    fetchJobMatchesMock.mockRejectedValue(new Error("boom"));
    seedStore();

    const { result } = renderHook(() => useJobOverlapDecorations());
    await waitFor(() => expect(fetchJobMatchesMock).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });
});
