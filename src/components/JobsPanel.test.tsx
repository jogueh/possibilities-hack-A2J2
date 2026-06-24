import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { JobsPanel } from "@/components/JobsPanel";
import { __setMockWebState, __resetMockWebState } from "@/store/useWebStore";
import type { WebNode } from "@/types/web";
import type { Job } from "@/types/data";
import type { JobMatch } from "@/types/job";

// Controllable return value for the mocked data layer so each test drives the
// panel deterministically (no dependency on the 1000-row jobs dataset).
const state = vi.hoisted(() => ({ matches: [] as JobMatch[] }));

vi.mock("@/mocks/jobsApi", () => ({
  fetchJobMatches: vi.fn(async () => state.matches),
}));

function job(overrides: Partial<Job> & { id: string }): Job {
  return {
    company: "Innovatech",
    location: "Austin, TX",
    position: "Software Engineer",
    salary_range: { from: "111111", to: "222222" },
    industry: "Technology",
    level: "Mid",
    easy_apply: false,
    description: "Build delightful products.",
    ...overrides,
  };
}

const node: WebNode = {
  id: "n_bob",
  userId: "user_4579",
  label: "Bob Smith",
  degree: 1,
  avatarInitials: "BS",
  alignmentTier: "moderate",
  interactionScore: 0,
  relevanceScore: 55,
  position: { x: 0, y: 0 },
};

function seed() {
  __setMockWebState({
    goal: { raw: "Become a software engineer", userId: "user_4579" },
    nodes: [node],
    edges: [],
    viewerProfile: null,
  });
}

beforeEach(() => {
  state.matches = [];
  seed();
});

afterEach(() => {
  cleanup();
  __resetMockWebState();
  vi.clearAllMocks();
});

describe("JobsPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<JobsPanel open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the explore-your-web empty state when there are no matches", async () => {
    state.matches = [];
    render(<JobsPanel open onClose={() => {}} />);
    const empty = await screen.findByTestId("jobs-empty-state");
    expect(empty.textContent).toMatch(/exploring other nodes of your web/i);
    expect(empty.textContent).not.toMatch(/broaden|refine your goal/i);
  });

  it("renders a job card with title, company, level and relevance pill", async () => {
    state.matches = [
      { job: job({ id: "j1", position: "Backend Engineer", company: "Acme" }), relevanceScore: 85, webConnections: [] },
    ];
    render(<JobsPanel open onClose={() => {}} />);
    expect(await screen.findByText("Backend Engineer")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Strong match")).toBeTruthy();
  });

  it("shows the Easy Apply badge only when the job is easy_apply", async () => {
    state.matches = [
      { job: job({ id: "easy", easy_apply: true }), relevanceScore: 80, webConnections: [] },
      { job: job({ id: "hard", easy_apply: false }), relevanceScore: 50, webConnections: [] },
    ];
    render(<JobsPanel open onClose={() => {}} />);
    await screen.findAllByTestId("job-card");
    expect(screen.getAllByText("Easy Apply")).toHaveLength(1);
  });

  it("renders the web-overlap callout with correct pluralization", async () => {
    state.matches = [
      {
        job: job({ id: "j1" }),
        relevanceScore: 90,
        webConnections: [{ userId: "user_4579", name: "Bob Smith", role: "Engineer" }],
      },
    ];
    const openSpy = vi.fn();
    render(<JobsPanel open onClose={() => {}} onOpenConnection={openSpy} />);
    const callout = await screen.findByTestId("web-overlap-callout");
    expect(callout.textContent).toMatch(/1 person in your web worked here/);
    expect(screen.getByText("Bob Smith")).toBeTruthy();

    screen.getByRole("button", { name: "Open Bob Smith's profile" }).click();
    expect(openSpy).toHaveBeenCalledWith("user_4579");
  });

  it("never renders salary data", async () => {
    state.matches = [
      { job: job({ id: "j1", salary_range: { from: "999111", to: "999222" } }), relevanceScore: 80, webConnections: [] },
    ];
    render(<JobsPanel open onClose={() => {}} />);
    await screen.findByTestId("job-card");
    expect(document.body.textContent).not.toMatch(/999111|999222/);
  });

  it("shows an error state (not the empty state) when the fetch rejects", async () => {
    const { fetchJobMatches } = await import("@/mocks/jobsApi");
    vi.mocked(fetchJobMatches).mockRejectedValueOnce(new Error("network down"));
    render(<JobsPanel open onClose={() => {}} />);
    const err = await screen.findByTestId("jobs-error-state");
    expect(err.textContent).toMatch(/couldn’t load jobs/i);
    expect(screen.queryByTestId("jobs-empty-state")).toBeNull();
  });

  it("retries the fetch when the retry button is clicked", async () => {
    const { fetchJobMatches } = await import("@/mocks/jobsApi");
    vi.mocked(fetchJobMatches).mockRejectedValueOnce(new Error("network down"));
    state.matches = [
      { job: job({ id: "j1", position: "Backend Engineer" }), relevanceScore: 85, webConnections: [] },
    ];
    render(<JobsPanel open onClose={() => {}} />);
    const retryBtn = await screen.findByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(await screen.findByText("Backend Engineer")).toBeTruthy();
    expect(screen.queryByTestId("jobs-error-state")).toBeNull();
  });

  it("prompts for a goal when none is set", async () => {
    __setMockWebState({ goal: null, nodes: [], edges: [], viewerProfile: null });
    render(<JobsPanel open onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/set a career goal/i)).toBeTruthy(),
    );
  });
});
