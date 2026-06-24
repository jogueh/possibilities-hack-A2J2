import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { NodeSidebar, __resetNodeSidebarTipCache } from "@/components/NodeSidebar";
import { __setMockWebState, __resetMockWebState } from "@/mocks/useWebStore";
import type { WebNode } from "@/types/web";
import type { Job, UserWithJobs } from "@/types/data";

// Controllable deferred for the profile fetch so we can assert the loading skeleton.
const deferred = vi.hoisted(() => {
  const d: { resolve?: (v: UserWithJobs | null) => void } = {};
  return d;
});

vi.mock("@/mocks/userApi", () => ({
  fetchUserWithJobs: vi.fn(
    () =>
      new Promise<UserWithJobs | null>((res) => {
        deferred.resolve = res;
      }),
  ),
}));

function job(company: string, position: string): Job {
  return {
    id: "j_" + company,
    company,
    location: "Boston, MA",
    position,
    salary_range: { from: "", to: "" },
    industry: "Tech",
    level: "Senior",
    easy_apply: false,
    description: "",
  };
}

function userWith(p: Partial<UserWithJobs> & { id: string; name: string }): UserWithJobs {
  return {
    school_history: [],
    job_history: [],
    current_location: "Boston, MA",
    posts_activity: [],
    skills: [],
    courses: [],
    connections: [],
    ...p,
  };
}

const node: WebNode = {
  id: "n1",
  userId: "user_1001",
  label: "Alice Nguyen",
  degree: 1,
  avatarInitials: "AN",
  alignmentTier: "strong",
  interactionScore: 0,
  relevanceScore: 85,
  position: { x: 0, y: 0 },
};

const target = userWith({
  id: "user_1001",
  name: "Alice Nguyen",
  job_history: [job("Google", "Software Engineer")],
  skills: ["Python"],
  current_location: "San Francisco, CA",
});

beforeEach(() => {
  __resetNodeSidebarTipCache();
  __resetMockWebState();
  deferred.resolve = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ tip: "Say hi!" }) })),
  );
  __setMockWebState({
    goal: { raw: "Break into software engineering", userId: "user_4579" },
    viewerProfile: userWith({ id: "user_4579", name: "Bob", skills: ["Sales"], current_location: "Austin, TX" }),
  });
});

describe("NodeSidebar", () => {
  it("renders a loading skeleton while the profile resolves", () => {
    render(<NodeSidebar node={node} onClose={() => {}} />);
    expect(screen.getByTestId("sidebar-skeleton")).toBeInTheDocument();
  });

  it("renders the profile header with name and most-recent role", async () => {
    render(<NodeSidebar node={node} onClose={() => {}} />);
    await act(async () => deferred.resolve!(target));
    expect(await screen.findByText("Alice Nguyen")).toBeInTheDocument();
    expect(screen.getByText(/Software Engineer · Google/)).toBeInTheDocument();
    expect(screen.getByText("Strong match for your goal")).toBeInTheDocument();
  });

  it("hides the commonalities section when there is no overlap", async () => {
    render(<NodeSidebar node={node} onClose={() => {}} />);
    await act(async () => deferred.resolve!(target));
    await screen.findByText("Alice Nguyen");
    expect(screen.queryByTestId("commonality-chip")).not.toBeInTheDocument();
  });

  it("renders commonality chips when viewer and target share context", async () => {
    __setMockWebState({
      viewerProfile: userWith({
        id: "user_4579",
        name: "Bob",
        skills: ["Python"],
        current_location: "San Francisco, CA",
      }),
    });
    render(<NodeSidebar node={node} onClose={() => {}} />);
    await act(async () => deferred.resolve!(target));
    await screen.findByText("Alice Nguyen");
    expect(screen.getAllByTestId("commonality-chip").length).toBeGreaterThan(0);
  });

  it("caches the AI talking point per userId across re-opens", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const { rerender } = render(<NodeSidebar node={node} onClose={() => {}} />);
    await act(async () => deferred.resolve!(target));
    await waitFor(() => expect(screen.getByTestId("talking-point")).toBeInTheDocument());
    const callsAfterFirst = fetchMock.mock.calls.length;

    // Close then re-open the same node.
    rerender(<NodeSidebar node={null} onClose={() => {}} />);
    rerender(<NodeSidebar node={node} onClose={() => {}} />);
    await act(async () => deferred.resolve!(target));
    await screen.findByText("Alice Nguyen");

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no extra talking-point call
  });
});
